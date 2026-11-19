---
layout: blog_post
title: Blog Components
slug: blog-components
date: 2026-11-19
authors: []
deck: "Reference for the components available in the contributor editor. Each one is a Jekyll include in `_includes/components/`, described in `_data/components.json`."
topics: []
tracks: []
permalink: /preview/components
noindex: true
sitemap: false
---
## Figure

A full-width figure with a caption. Click it to enlarge.

{% include components/figure.html src="/images/2026-10-irsc2.jpg" alt="IRSC26 participants in a lecture theatre" caption="Figure 1. IRSC26 participants gather for a session." %}

A small image, such as a logo or headshot:

{% include components/figure.html src="/images/Logo_DOE_Unofficial_Sm.png" alt="U.S. Department of Energy logo" style="logo" %}

## Profile card

### Drew Paine

{% include components/profile-card.html photo="/images/People_2026_F_Paine.jpg" bio="Drew is a User Experience Research Lead in the Scientific Data Division at Lawrence Berkeley National Laboratory." %}

## Link row

{% include components/link-row.html url="https://bssw.io/items/what-is-peer-code-review" text="What is Peer Code Review?" %}

{% include components/link-row.html url="https://bssw.io/items/what-is-cse-software-testing" text="What is CSE Software Testing?" %}

## Collapsible section

{% capture collapsible_body_1 %}
The body is ordinary Markdown:

- **Lists**, *emphasis* and [links](https://bssw.io)
- Tables and code blocks

| Method | Phase |
| --- | --- |
| Interviews | Planning |
| Usability tests | Release |
{% endcapture %}
{% include components/collapsible.html summary="Details on the methods" body=collapsible_body_1 %}

## After the components

A closing paragraph.
