# frozen_string_literal: true

# Liquid filters reproducing Rails view helpers.
module BSSW
  module Filters
    # layouts/_breadcrumbs: name[0..34].gsub(/\s\w+\s*$/, '...')
    def rails_crumb(input, last_index = 34)
      input.to_s[0..last_index.to_i].gsub(/\s\w+\s*$/, '...')
    end

    # Array#to_sentence (", " / " and " / ", and ")
    def to_sentence(input)
      list = Array(input).map(&:to_s)
      case list.size
      when 0 then ''
      when 1 then list[0]
      when 2 then "#{list[0]} and #{list[1]}"
      else "#{list[0..-2].join(', ')}, and #{list[-1]}"
      end
    end
  end
end

Liquid::Template.register_filter(BSSW::Filters)
