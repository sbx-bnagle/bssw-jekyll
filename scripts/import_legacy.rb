#!/usr/bin/env ruby
# frozen_string_literal: true

# Converts legacy BSSw content (betterscientificsoftware/bssw.io) into Jekyll
# files with YAML front matter.
#
#   ruby scripts/import_legacy.rb --repo ~/Sites/bssw.io [--ref origin/main] \
#        [--manifest scripts/import_manifest.yml] [--github-lookup]
#
# Files are read with `git show <ref>:<path>`, so the source checkout is never
# modified. Output is written into this Jekyll project:
#
#   Articles/Blog/*.md                    -> _posts/YYYY-MM-DD-<slug>.md
#   CuratedContent/*.md, Articles/WhatIs  -> _items/<slug>.md
#   Events/*.md                           -> _events/<slug>.md
#   Site/Communities/*.md                 -> _communities/<slug>.md
#   Site/BSSwFellowshipProgram/People/*   -> _fellows/<slug>.md
#   Site/**/*.md (everything else)        -> _site_pages/<slug>.md
#   Site/Topics/*.md                      -> _data/categories.yml
#   Articles/BlogTracks.md                -> _data/tracks.yml
#   contributor lines                     -> _data/authors.yml
#   ../images/*                           -> images/*
#
# The parsing rules mirror the Rails importer (Parallactic/bssw.io):
# the first H1 is the title, "#### Contributed by" lists authors,
# "#### Publication date:" is the date, the first non-blank paragraph is the
# deck/snippet, and the trailing <!--- Key: value ---> block holds metadata.

require 'date'
require 'fileutils'
require 'json'
require 'net/http'
require 'open3'
require 'optparse'
require 'yaml'

ROOT = File.expand_path('..', __dir__)

opts = { ref: 'origin/main', manifest: File.join(__dir__, 'import_manifest.yml'), github_lookup: false }
OptionParser.new do |o|
  o.on('--repo PATH') { |v| opts[:repo] = File.expand_path(v) }
  o.on('--ref REF') { |v| opts[:ref] = v }
  o.on('--manifest PATH') { |v| opts[:manifest] = v }
  o.on('--github-lookup', 'Fill author affiliation/avatar from the GitHub API') { opts[:github_lookup] = true }
end.parse!
abort 'usage: import_legacy.rb --repo PATH' unless opts[:repo]

# ---------------------------------------------------------------- helpers ---

def parameterize(str)
  str.to_s.unicode_normalize(:nfkd).gsub(/[^\x00-\x7F]/, '').downcase
     .gsub(/[^a-z0-9\-_]+/, '-').gsub(/-{2,}/, '-').gsub(/\A-|-\z/, '')
end

class Source
  def initialize(repo, ref)
    @repo = repo
    @ref = ref
  end

  def read(path)
    out, _err, status = Open3.capture3('git', '-C', @repo, 'show', "#{@ref}:#{path}")
    status.success? ? out.force_encoding('UTF-8') : nil
  end

  def ls(dir)
    out, = Open3.capture2('git', '-C', @repo, 'ls-tree', '--name-only', "#{@ref}:#{dir}")
    out.split("\n").map { |f| File.join(dir, f) }
  end

  def find_by_basename(name)
    @all ||= begin
      out, = Open3.capture2('git', '-C', @repo, 'ls-tree', '-r', '--name-only', @ref)
      out.split("\n").select { |f| f.end_with?('.md') }
    end
    @all.find { |f| File.basename(f) == name }
  end

  def binary(path)
    out, _err, status = Open3.capture3('git', '-C', @repo, 'show', "#{@ref}:#{path}", binmode: true)
    status.success? ? out : nil
  end
end

SRC = Source.new(opts[:repo], opts[:ref])
MANIFEST = YAML.safe_load_file(opts[:manifest])

def kind_for(path)
  case path
  when %r{\AArticles/Blog/} then :post
  when %r{\A(CuratedContent|Articles/WhatIs)/} then :item
  when %r{\AEvents/} then :event
  when %r{\ASite/Communities/} then :community
  when %r{\ASite/BSSwFellowshipProgram/People/} then :fellow
  when %r{\ASite/} then :page
  end
end

URL_PREFIX = { post: '/items/', item: '/items/', event: '/items/', community: '/communities/',
               page: '/pages/', fellow: '/fellows/' }.freeze

# Rails: first h1, else h2, else h3 (MarkdownUtility.get_title_chunk)
def title_level(text)
  %w[# ## ###].find { |h| text.to_s =~ /^#{h}\s+\S/ }
end

def title_of(text)
  h = title_level(text) or return nil
  text.to_s[/^#{h}\s+(.+?)\s*$/, 1]
end

# Resolve a legacy relative .md link to the URL the Rails app would produce.
def resolve_md_link(from_path, href)
  target = File.expand_path(href.sub(/#.*\z/, ''), "/#{File.dirname(from_path)}").delete_prefix('/')
  text = SRC.read(target)
  unless text
    # Rails resolves links by file basename anywhere in the repo
    target = SRC.find_by_basename(File.basename(target))
    text = target && SRC.read(target)
  end
  return href unless text

  kind = kind_for(target)
  "#{URL_PREFIX[kind] || '/items/'}#{parameterize(title_of(text))}#{href[/#.*\z/]}"
end

$images = []

def rewrite_body(path, body)
  # images: ../../images/foo.png -> /images/foo.png
  body = body.gsub(%r{(?:\.\./)+images/([^\s'")?]+)(\?raw=true)?}) do
    $images << Regexp.last_match(1)
    "/images/#{Regexp.last_match(1)}"
  end
  # markdown links to other legacy .md files
  body = body.gsub(/\]\(((?!https?:)[^)\s]+\.md(?:#[^)\s]*)?)\)/) { "](#{resolve_md_link(path, Regexp.last_match(1))})" }
  body.gsub(/href=(["'])((?!https?:)[^"']+\.md(?:#[^"']*)?)\1/) { "href=\"#{resolve_md_link(path, Regexp.last_match(2))}\"" }
end

# Trailing/embedded <!--- Key: value ---> blocks. Rails reads "Publish:",
# "Topics:", "Track:", "Pinned:", "RSS update:" etc. from any comment.
META_KEYS = /\A(Publish|Pinned|Topics?|Tracks?|RSS update|Tags|Aggregate|Category order|Topic order|Order)\s*:/i

def extract_meta(body)
  meta = {}
  body = body.gsub(/<!---?\s*\n?(.*?)-?-->/m) do |block|
    inner = Regexp.last_match(1)
    lines = inner.lines.map(&:strip).reject(&:empty?)
    if lines.any? { |l| l =~ META_KEYS }
      lines.each do |l|
        k, v = l.split(':', 2)
        meta[k.strip.downcase] = v.to_s.strip if v && l =~ META_KEYS
      end
      ''
    else
      block
    end
  end
  [body, meta]
end

def split_names(str)
  links = []
  s = str.gsub(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/) do
    links << [Regexp.last_match(1).strip, Regexp.last_match(2)]
    "@@LINK#{links.size - 1}@@"
  end
  s.split(/\s*,\s*(?:and\s+)?|\s+and\s+/).map(&:strip).reject(&:empty?).map do |part|
    if (m = part.match(/@@LINK(\d+)@@/))
      name, url = links[m[1].to_i]
      gh = url[%r{github\.com/([A-Za-z0-9-]+)/?\z}, 1]
      { 'name' => name, 'github' => gh, 'website' => url }
    else
      { 'name' => part }
    end
  end
end

$authors = {}

def register_authors(line)
  split_names(line).map do |a|
    # One entry per GitHub account (Rails keys authors by GitHub login).
    slug = ($authors.find { |_, e| a['github'] && e['github'] == a['github'] }&.first) || parameterize(a['name'])
    entry = ($authors[slug] ||= { 'name' => a['name'] })
    entry['github'] ||= a['github'] if a['github']
    entry['website'] ||= a['website'] if a['website']
    slug
  end
end

def categories
  @categories ||= YAML.safe_load_file(File.join(ROOT, '_data/categories.yml'))
end

def topic_slugs(list)
  return [] if list.to_s.strip.empty?

  index = categories.flat_map { |c| c['topics'] }.to_h { |t| [t['name'].downcase, t['slug']] }
  list.split(',').map(&:strip).reject(&:empty?).map do |name|
    index[name.downcase] || (warn("  ! unknown topic '#{name}'") || parameterize(name))
  end
end

def track_slugs(list)
  list.to_s.split(',').map(&:strip).reject(&:empty?).map { |t| parameterize(t) }
end

def parse_date(str)
  str = str.to_s.strip
  return nil unless str =~ /\b\d{4}\b/ # Date.parse guesses wildly without a year

  Date.parse(str)
rescue ArgumentError
  nil
end

# First non-blank paragraph (Rails: SiteItem#snippet). Returns [deck, rest].
def take_deck(body)
  body = body.gsub(/^<!--\s*((begin|end|start) (of )?(the )?deck|deck text (start|end))\s*-->[ \t]*$/i, '')
  blocks = body.split(/\n{2,}/)
  idx = blocks.index do |b|
    s = b.strip
    !s.empty? && s !~ /\A(<!--|#|[-*+] |\d+\. |\||<(?!a\b|strong|em|b\b|i\b|code|span)|!\[)/
  end
  return [nil, body] unless idx

  deck = blocks.delete_at(idx).strip
  [deck, blocks.join("\n\n")]
end

def front_matter(hash)
  clean = hash.reject { |_, v| v.nil? || v == [] || v == '' }
  YAML.dump(clean, line_width: -1).sub(/\A---\n/, "---\n") + "---\n"
end

def write(rel, fm, body)
  path = File.join(ROOT, rel)
  FileUtils.mkdir_p(File.dirname(path))
  File.write(path, front_matter(fm) + "\n" + body.strip + "\n")
  puts "  wrote #{rel}"
end

# -------------------------------------------------------------- taxonomy ---

def import_categories
  cats = SRC.ls('Site/Topics').filter_map do |path|
    text = SRC.read(path)
    name = title_of(text)
    home = text[/\*\*Homepage:\*\*\s*(.+?)\s*$/, 1]
    overview = text[/\*\*Overview:\*\*\s*\n?(.+?)\n\n/m, 1].to_s.strip
    order = text[/Category order:\s*(\d+)/, 1].to_i
    topics = text.scan(/^- \*\*(.+?)\*\*\s*\n(.*?)\n<!---\s*Topic order:\s*(\d+)/m).map do |tname, desc, tord|
      { 'name' => tname.strip, 'slug' => parameterize(tname), 'overview' => desc.strip, 'order' => tord.to_i }
    end.sort_by { |t| t['order'] }
    { 'name' => name, 'slug' => parameterize(name), 'homepage' => home, 'overview' => overview,
      'order' => order, 'topics' => topics }
  end
  cats.sort_by! { |c| c['order'] }
  File.write(File.join(ROOT, '_data/categories.yml'),
             "# Generated by scripts/import_legacy.rb from Site/Topics/*.md\n" + YAML.dump(cats, line_width: -1))
  puts "  wrote _data/categories.yml (#{cats.size} categories)"
end

def import_tracks
  text = SRC.read('Articles/BlogTracks.md')
  tracks = text.scan(/^- ([^:]+):\s*(.+)$/).map { |n, d| { 'name' => n.strip, 'slug' => parameterize(n), 'description' => d.strip } }
  File.write(File.join(ROOT, '_data/tracks.yml'),
             "# Generated by scripts/import_legacy.rb from Articles/BlogTracks.md\n" + YAML.dump(tracks, line_width: -1))
  puts "  wrote _data/tracks.yml (#{tracks.size} tracks)"
end

# ----------------------------------------------------------------- items ---

def common(path, text)
  body = text.dup.gsub("\r\n", "\n")
  title = title_of(body)
  if (h = title_level(body))
    body = body.sub(/^#{h}\s+.+\n/, '')
  end

  hero = {}
  if body =~ /\*\*Hero Image:\*\*/
    li = body[/\*\*Hero Image:\*\*\s*\n+\s*[-*] (.+)$/, 1].to_s
    hero['src'] = li[/src=['"]([^'"]+)['"]/, 1]
    hero['alt'] = li[/alt=['"]([^'"]*)['"]/, 1]
    hero['caption'] = li[/\[(.*?)\]/, 1]
    body = body.sub(/\*\*Hero Image:\*\*\s*\n+\s*[-*] .+\n/, '')
  end

  authors = []
  body = body.sub(/^####\s*Contributed by\s+(.+?)\s*$\n?/i) { authors = register_authors(Regexp.last_match(1)); '' }
  date = nil
  body = body.sub(/^####\s*Publication date:\s*(.+?)\s*$\n?/i) { date = parse_date(Regexp.last_match(1)); '' }
  body, meta = extract_meta(body)
  { title: title, body: body, hero: hero, authors: authors, date: date, meta: meta, path: path }
end

def base_fm(c, slug, deck)
  {
    'title' => c[:title],
    'slug' => slug,
    'date' => c[:date],
    'authors' => c[:authors],
    'deck' => deck,
    'topics' => topic_slugs(c[:meta]['topics'] || c[:meta]['topic']),
    'published' => c[:meta]['publish'].nil? || c[:meta]['publish'] =~ /yes|true/i ? nil : false,
    'legacy_path' => c[:path]
  }
end

def import_post(path, text)
  c = common(path, text)
  slug = parameterize(c[:title])
  deck, body = take_deck(c[:body])
  fm = base_fm(c, slug, deck)
  fm['tracks'] = track_slugs(c[:meta]['track'] || c[:meta]['tracks'])
  if c[:hero]['src']
    fm['hero_image'] = rewrite_body(path, c[:hero]['src'])
    fm['hero_image_alt'] = c[:hero]['alt']
    fm['hero_image_caption'] = c[:hero]['caption']
  end
  fm['rss_date'] = parse_date(c[:meta]['rss update'])
  date = c[:date] || Date.today
  write("_posts/#{date.strftime('%Y-%m-%d')}-#{slug}.md", fm, rewrite_body(path, body))
end

def import_item(path, text)
  c = common(path, text)
  slug = parameterize(c[:title])
  deck, body = take_deck(c[:body])
  fm = base_fm(c, slug, deck)
  fm['pinned'] = true if c[:meta]['pinned'] =~ /yes|true/i
  fm['rss_date'] = parse_date(c[:meta]['rss update'])
  write("_items/#{slug}.md", fm, rewrite_body(path, body))
end

DATE_RANGE = /\A(.+?\d{4})\s*(?:-|–|&ndash;|to)\s*(.+?\d{4})\z/

def import_event(path, text)
  c = common(path, text)
  slug = parameterize(c[:title])
  body = c[:body]
  fields = {}
  dates = []
  # Rails reads these from the first <ul> of the document and removes the <li>s.
  body = body.sub(/((?:^[-*] [^\n]+\n?)+)/) do |list|
    list.lines.each do |line|
      key, val = line.sub(/\A[-*]\s+/, '').strip.split(':', 2).map { |s| s.to_s.strip }
      next unless val

      if key =~ /date|deadline/i
        if (m = val.match(/\A([A-Za-z]+\.?)\s+(\d{1,2})\s*(?:-|–|&ndash;)\s*(\d{1,2}),?\s*(\d{4})\z/))
          # "October 19-21, 2026"
          dates << { 'label' => key, 'start' => parse_date("#{m[1]} #{m[2]}, #{m[4]}"), 'end' => parse_date("#{m[1]} #{m[3]}, #{m[4]}") }
        elsif (m = val.match(/\A([A-Za-z]+\.?\s+\d{1,2})\s*(?:-|–|&ndash;)\s*([A-Za-z]+\.?\s+\d{1,2}),?\s*(\d{4})\z/))
          # "June 30 - July 2, 2026"
          dates << { 'label' => key, 'start' => parse_date("#{m[1]}, #{m[3]}"), 'end' => parse_date("#{m[2]}, #{m[3]}") }
        elsif (m = val.match(DATE_RANGE))
          dates << { 'label' => key, 'start' => parse_date(m[1]), 'end' => parse_date(m[2]) }
        else
          val.split(/\s*[;,]\s*(?=[A-Z][a-z]+ \d)/).each do |d|
            dates << { 'label' => key, 'start' => parse_date(d) }
          end
        end
      elsif key =~ /website/i
        if (m = val.match(/\A\[(.*?)\]\((.*?)\)\z/))
          fields['website_label'] = m[1]
          fields['website'] = m[2]
        else
          fields['website'] = val.delete_prefix('<').delete_suffix('>')
        end
      elsif key =~ /\A(location|organizers?)\z/i
        fields[key.downcase.sub(/s\z/, '') == 'organizer' ? 'organizers' : key.downcase] = val
      end
    end
    ''
  end
  body = body.sub(/\*\*Description:\*\*/, '')
  deck, body = take_deck(body)
  fm = base_fm(c, slug, deck)
  fm.merge!(fields)
  fm['dates'] = dates.map { |d| d.compact }
  fm['tags'] = c[:meta]['tags'].to_s.split(',').map(&:strip)
  write("_events/#{slug}.md", fm, rewrite_body(path, body))
end

def import_page(path, text, kind)
  c = common(path, text)
  slug = parameterize(c[:title])
  body = c[:body]
  featured = []
  if kind == :community
    body = body.sub(/<!--[^>]*Featured resources.*\z/mi) do |tail|
      tail.scan(/\]\(([^)\s]+\.md)\)/).each do |(href)|
        url = resolve_md_link(path, href)
        featured << url.sub(%r{\A/items/}, '') if url.start_with?('/items/')
      end
      tail.sub(/\A(<!--.*?-->).*\z/m, '\1')
    end
  end
  staff = []
  if path == 'Site/About.md'
    # Rails Staff model: the "BSSw Editorial Team" section becomes a card grid.
    body = body.sub(/^## BSSw Editorial Team\s*\n(.*?)(?=^## Partners)/m) do
      section = nil
      Regexp.last_match(1).split(/\n[ \t]*\n/).each do |block|
        block = block.strip
        if (h = block[/\A###\s+(.+)\z/, 1])
          section = h.strip
          next
        end
        lines = block.split(/<br\s*\/?>\s*\n?|\n/).map(&:strip).reject(&:empty?)
        next if lines.empty?

        person = { 'name' => lines.shift, 'section' => section }
        lines.each do |l|
          if (t = l[/\ATitle:\s*(.+)\z/, 1]) then person['title'] = t
          elsif (gh = l[%r{github\.com/([A-Za-z0-9-]+)}, 1]) then person['github'] = gh
          else person['affiliation'] ||= l
          end
        end
        if person['github'] && $lookup
          prof = github_profile(person['github'])
          person['avatar'] = "https://avatars.githubusercontent.com/u/#{prof['id']}" if prof['id']
        end
        staff << person
      end
      ''
    end
  end
  deck, body = take_deck(body)
  fm = { 'title' => c[:title], 'slug' => slug, 'deck' => deck, 'featured' => featured, 'staff' => staff,
         'published' => base_fm(c, slug, deck)['published'], 'legacy_path' => path }
  dir = { community: '_communities', fellow: '_fellows', page: '_site_pages' }[kind]
  write("#{dir}/#{slug}.md", fm, rewrite_body(path, body))
end

FELLOW_FIELDS = { 'year' => 'year', 'name' => 'title', 'affiliation' => 'affiliation', 'image' => 'image',
                  'url' => 'website', 'linkedin' => 'linkedin', 'github' => 'github', 'short bio' => 'short_bio',
                  'honorable mention' => 'honorable_mention' }.freeze

def import_fellow(path, text)
  body = text.gsub("\r\n", "\n")
  fm = {}
  body = body.gsub(/^\*\*([A-Za-z ]+):\*\*[ \t]*(.*)$\n?/) do
    key = Regexp.last_match(1).strip.downcase
    val = Regexp.last_match(2).strip
    if key == 'long bio'
      ''
    elsif FELLOW_FIELDS[key]
      fm[FELLOW_FIELDS[key]] = val unless val.empty?
      ''
    else
      Regexp.last_match(0)
    end
  end
  body, meta = extract_meta(body)
  fm['honorable_mention'] = fm['honorable_mention'].to_s =~ /yes|true/i ? true : nil
  fm['image'] = rewrite_body(path, fm['image'].sub(%r{\A/images/}, '../../../images/')) if fm['image']
  slug = parameterize(fm['title'])
  fm = { 'title' => fm.delete('title'), 'slug' => slug }.merge(fm)
  fm['last_name'] = fm['title'].to_s.split.last
  fm['published'] = meta['publish'].nil? || meta['publish'] =~ /yes|true/i ? nil : false
  fm['legacy_path'] = path
  write("_fellows/#{slug}.md", fm, rewrite_body(path, body))
end

# --------------------------------------------------------------- authors ---

def github_profile(login)
  uri = URI("https://api.github.com/users/#{login}")
  req = Net::HTTP::Get.new(uri, 'User-Agent' => 'bssw-jekyll-importer', 'Accept' => 'application/vnd.github+json')
  req['Authorization'] = "Bearer #{ENV['GITHUB_TOKEN']}" if ENV['GITHUB_TOKEN']
  res = Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |h| h.request(req) }
  res.is_a?(Net::HTTPSuccess) ? JSON.parse(res.body) : {}
rescue StandardError
  {}
end

def write_authors(lookup)
  file = File.join(ROOT, '_data/authors.yml')
  existing = File.exist?(file) ? (YAML.safe_load_file(file) || {}) : {}
  $authors.each do |slug, a|
    entry = existing[slug] || {}
    entry['name'] ||= a['name']
    entry['github'] ||= a['github'] if a['github']
    entry['website'] ||= a['website'] if a['website']
    if lookup && entry['github'] && !entry['avatar']
      prof = github_profile(entry['github'])
      entry['avatar'] = "https://avatars.githubusercontent.com/u/#{prof['id']}" if prof['id']
      entry['affiliation'] ||= prof['company'].to_s.strip unless prof['company'].to_s.strip.empty?
    end
    # alphabetize like the Rails Author model (last name)
    entry['sort_name'] ||= a['name'].split.last
    existing[slug] = entry
  end
  sorted = existing.sort_by { |_, v| [v['sort_name'].to_s.downcase, v['name'].to_s.downcase] }.to_h
  File.write(file, "# Contributors. Key = slug used in front matter `authors:` lists.\n" \
                   "# `github` lets the editor match a signed-in contributor to their entry.\n" +
                   YAML.dump(sorted, line_width: -1))
  puts "  wrote _data/authors.yml (#{sorted.size} authors)"
end

def copy_images
  extra = MANIFEST.fetch('images', [])
  ($images + extra).uniq.each do |img|
    data = SRC.binary("images/#{img}")
    next warn("  ! missing image #{img}") unless data

    dest = File.join(ROOT, 'images', img)
    FileUtils.mkdir_p(File.dirname(dest))
    File.binwrite(dest, data)
  end
  puts "  copied #{($images + extra).uniq.size} images"
end

# ------------------------------------------------------------------- run ---

$lookup = opts[:github_lookup]
puts "Importing from #{opts[:repo]} @ #{opts[:ref]}"
import_categories
import_tracks
MANIFEST.fetch('files').each do |path|
  text = SRC.read(path) or (warn("  ! missing #{path}") && next)
  case kind_for(path)
  when :post then import_post(path, text)
  when :item then import_item(path, text)
  when :event then import_event(path, text)
  when :community then import_page(path, text, :community)
  when :fellow then import_fellow(path, text)
  when :page then import_page(path, text, :page)
  else warn "  ! unsupported path #{path}"
  end
end
write_authors(opts[:github_lookup])
copy_images
