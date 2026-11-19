# frozen_string_literal: true

# Every site item (blog post, event, resource) answers at /items/<slug>, as on
# the Rails site. Resources live there natively; posts and events get a
# redirect_from alias here so content files don't have to declare it.
# Runs before jekyll-redirect-from's generator.
module BSSW
  class ItemAliases < Jekyll::Generator
    priority :highest

    def generate(site)
      docs = site.posts.docs + (site.collections['events']&.docs || [])
      docs.each do |doc|
        slug = doc.data['slug'] || doc.data['slug'] = Jekyll::Utils.slugify(doc.basename_without_ext.sub(/\A\d{4}-\d{2}-\d{2}-/, ''))
        aliases = Array(doc.data['redirect_from'])
        alias_path = "/items/#{slug}"
        doc.data['redirect_from'] = (aliases + [alias_path]).uniq
      end
    end
  end
end
