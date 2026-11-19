// Site data read straight from the Jekyll repo at build time (single source
// of truth). Authors are refreshed from GitHub after sign-in.
import yaml from 'js-yaml';
import categoriesYml from '../../_data/categories.yml?raw';
import tracksYml from '../../_data/tracks.yml?raw';
import authorsYml from '../../_data/authors.yml?raw';
import componentsJson from '../../_data/components.json';

export interface Topic { name: string; slug: string; overview?: string }
export interface Category { name: string; slug: string; topics: Topic[] }
export interface Track { name: string; slug: string; description?: string }
export interface Author { name: string; github?: string; avatar?: string; affiliation?: string; website?: string; sort_name?: string }

export type FieldType = 'text' | 'textarea' | 'url' | 'select' | 'checkbox' | 'image' | 'markdown';
export interface ComponentField {
  name: string; label: string; type: FieldType; required?: boolean; help?: string; default?: string;
  options?: { value: string; label: string }[]; showIf?: Record<string, string>;
}
export interface ComponentDef {
  id: string; label: string; description: string; include: string; inline: boolean; fields: ComponentField[];
}

export const categories = yaml.load(categoriesYml) as Category[];
export const tracks = yaml.load(tracksYml) as Track[];
export let authors = (yaml.load(authorsYml) || {}) as Record<string, Author>;
export const components = componentsJson as ComponentDef[];

const raw = import.meta.glob('../../_includes/components/*.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
export const templates: Record<string, string> = Object.fromEntries(
  Object.entries(raw).map(([p, src]) => [`components/${p.split('/').pop()}`, src])
);

export function setAuthors(next: Record<string, Author>) { authors = next; }

export function topicBySlug(slug: string): { topic: Topic; category: Category } | undefined {
  for (const category of categories) {
    const topic = category.topics.find((t) => t.slug === slug);
    if (topic) return { topic, category };
  }
  return undefined;
}
