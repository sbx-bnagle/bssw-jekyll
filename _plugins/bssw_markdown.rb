# frozen_string_literal: true

# Markdown is rendered with Redcarpet + Rouge using the exact options of the
# Rails importer (GithubImporter.parse_html_from in Parallactic/bssw.io), so
# Jekyll output matches bssw.io (straight quotes, toc ids, lax spacing, ...).
#
# The contributor editor's in-browser preview should use a Redcarpet-compatible
# renderer (marked with GFM tables/strikethrough/autolink) for parity.
require 'redcarpet'
require 'rouge'
require 'rouge/plugins/redcarpet'

module Jekyll
  module Converters
    class Markdown
      class BSSWMarkdown
        class Renderer < Redcarpet::Render::HTML
          include Rouge::Plugins::Redcarpet
        end

        OPTIONS = {
          autolink: true,
          tables: true,
          lax_spacing: true,
          strikethrough: true,
          fenced_code_blocks: true,
          no_intra_emphasis: true
        }.freeze

        def initialize(config)
          @config = config
        end

        def convert(content)
          Redcarpet::Markdown.new(Renderer.new(with_toc_data: true), OPTIONS).render(content)
        end
      end
    end
  end
end
