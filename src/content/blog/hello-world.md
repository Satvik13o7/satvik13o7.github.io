---
title: "Hello"
description: "What this site is for, and what to expect from the writing here."
date: 2026-04-30
draft: false
---

This is the first post on a small writing space attached to my profile. I'll use it for short, opinionated notes on agent infrastructure &mdash; tool caches, side-effect classification, multi-tenant safety, the boring plumbing that decides whether a production agent works on a Tuesday afternoon.

The bias of every post will be the same: anchor to numbers from real workloads, avoid vibes, link to source where source exists.

A few topics queued up:

- Why your agent's `lru_cache` is lying to you.
- How we accidentally cached an email-send tool.
- A cross-tenant cache hit is a security incident, not a bug.
- Where does agent latency actually go? A trace breakdown of 1M tool calls.

If any of that is interesting, the [writing index](/blog) will fill out as posts ship. Reach out at satvikumar02@gmail.com if you're running LangGraph or Pydantic AI in production and have a tool-cache war story to compare notes on.
