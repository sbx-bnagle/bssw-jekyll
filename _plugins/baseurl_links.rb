# frozen_string_literal: true

# Templates and content keep root-relative links ("/items", "/assets/...",
# "/images/...") exactly as on bssw.io. When the site is served from a
# subpath (e.g. a GitHub Pages project site at /bssw-jekyll), this hook
# prefixes those links with site.baseurl in the rendered HTML. With an
# empty baseurl (bssw.io itself) it does nothing.
module BSSW
  module BaseurlLinks
    ATTR = %r{(\s(?:href|src|action|content|poster)=)(["'])/(?!/)}
    CSS_URL = %r{(url\(\s*["']?)/(?!/)}

    def self.rewrite(html, base)
      prefix = "#{base}/"
      html = html.gsub(ATTR) do
        m = Regexp.last_match
        rest = Regexp.last_match.post_match
        rest.start_with?(prefix.delete_prefix('/')) ? m[0] : "#{m[1]}#{m[2]}#{prefix}"
      end
      html.gsub(CSS_URL) do
        m = Regexp.last_match
        m.post_match.start_with?(prefix.delete_prefix('/')) ? m[0] : "#{m[1]}#{prefix}"
      end
    end
  end
end

Jekyll::Hooks.register [:pages, :documents], :post_render do |doc|
  base = doc.site.config['baseurl'].to_s.chomp('/')
  next if base.empty? || doc.output_ext != '.html' || doc.output.nil?

  doc.output = BSSW::BaseurlLinks.rewrite(doc.output, base)
end
