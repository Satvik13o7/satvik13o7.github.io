---
title: "Why your agent's lru_cache is lying to you"
description: "Eight ways the laziest caching decision in your codebase is silently breaking your agent — and what a real tool cache actually has to do."
date: 2026-05-02
draft: false
---

You wrote your first agent. It calls four or five tools per turn &mdash; `search_products`, `get_inventory`, `lookup_customer`, `fetch_order_status`. Latency is dominated by those tool calls, and you're paying for every one. So you do what every Python developer does when a function is expensive and pure-ish:

```python
from functools import lru_cache

@lru_cache(maxsize=1024)
def get_inventory(sku: str, warehouse: str = "us-west") -> int:
    return shopify.inventory.get(sku=sku, warehouse=warehouse)
```

P50 latency drops. The model bill drops. You ship.

This post is about the half-dozen ways that decorator is now lying to you, and to your users, in production. None of them are theoretical. All of them are the kind of bug that sits in a codebase for nine months and surfaces during a demo.

---

## Lie 1 &mdash; "Same arguments" is doing a lot of work

`lru_cache` keys on the literal `(args, kwargs)` tuple. So these are two different cache entries:

```python
get_inventory("ABC-123")
get_inventory("ABC-123", "us-west")
```

Same call. Different key. You pay for both.

Now make it worse. Your agent framework serializes tool arguments through JSON before the LLM sees them, and the LLM writes them back out as JSON. Dict ordering isn't stable across calls. You "cache":

```python
search_products({"category": "laptops", "max_price": 2000})
search_products({"max_price": 2000, "category": "laptops"})
```

Hash mismatch. Two entries. And `lru_cache` won't even take that directly &mdash; dicts aren't hashable, so you've serialized to a JSON string somewhere upstream, and now you're at the mercy of `json.dumps`'s key ordering, your numeric coercion (`2000` vs `2000.0`), and whatever default values your tool schema fills in.

The fix is canonicalization: sort keys, normalize numeric types, strip defaults, lowercase enum strings, hash the result. `lru_cache` does none of this. It is keying on the bytes you happened to hand it.

---

## Lie 2 &mdash; Your write-tools are now read-tools

Watch what happens when an agent calls this:

```python
@lru_cache(maxsize=1024)
def create_support_ticket(user_id: str, subject: str, body: str) -> str:
    return zendesk.tickets.create(...)
```

First call: ticket created, ID returned, cached. Second call with the same args: no ticket created, old ID returned. The agent thinks it filed a ticket. There is no ticket. The user's complaint goes nowhere.

`lru_cache` does not know which of your tools are reads and which are writes. It will happily cache `send_email`, `create_order`, `refund_charge`, `delete_user`. Every cache hit on a write is a silent no-op of a side effect.

The version of this bug I see most often in the wild: an agent retries on a transient failure, the retry hits the cache, and "succeeds" without ever doing the thing.

> The user gets a confirmation message for an action that did not happen.

---

## Lie 3 &mdash; User A's data is in user B's cache

`lru_cache` is process-global. There is no tenant.

```python
@lru_cache
def get_account_balance(account_id: str) -> Decimal:
    ...
```

You think the `account_id` argument scopes it. It does &mdash; until your agent framework passes the *current user's* identity as part of the tool's implicit context (auth header, session cookie, tenant subdomain) rather than as an argument. Now user A asks "what's my balance," the tool resolves their identity from the request, fetches their balance, and caches it under a key that doesn't include them. User B asks the same question. Cache hit. User B sees user A's balance.

This is not a hypothetical. It is the failure mode of every "let's just add `@lru_cache`" PR that does not explicitly route the auth principal into the cache key. `lru_cache` gives you no way to do that without writing a wrapper that mostly defeats the point.

The right primitive is a per-tenant salt &mdash; an HMAC of the principal mixed into every key. The wrong primitive is hoping nobody forgets.

---

## Lie 4 &mdash; There is no TTL, only eviction

`lru_cache` evicts when the cache is full. It does not evict when the data goes stale.

```python
@lru_cache(maxsize=1024)
def get_stock_price(ticker: str) -> Decimal:
    ...
```

It is 4pm. The market closed at 4pm. Your agent quotes the 3:59 price for the rest of the night, and at 9:30am tomorrow it quotes yesterday's close until the cache happens to evict on size pressure.

Different tools want wildly different freshness:

- `get_company_info(ticker)` &mdash; stable for weeks.
- `get_stock_price(ticker)` &mdash; stable for seconds during market hours, hours after close.
- `get_inventory(sku)` &mdash; depends on the SKU. A slow mover is stable for hours; a flash-sale item is stale in 30 seconds.

A single `maxsize` cannot express any of that. You need per-tool TTLs at minimum, and ideally per-key TTLs that adapt based on how often the underlying value actually changes. `lru_cache` has no concept of either.

---

## Lie 5 &mdash; When the truth changes, the cache doesn't know

Even per-key TTLs are a guess. The honest version of "how long is this value good for" is "until the source of truth changes." For a lot of tools, you can know exactly when that happens, because the source of truth has webhooks:

- Shopify fires `inventory_levels/update` when stock moves.
- Stripe fires `customer.subscription.updated` when a plan changes.
- GitHub fires `pull_request.synchronize` when a branch is pushed.

If your cache layer doesn't subscribe to those, you are guessing how long the value is good for. If it does, you can hold cached values for hours and still be correct, because the moment the truth shifts you invalidate the keys it touched.

`lru_cache` cannot do this. Nothing in `functools` was ever going to.

---

## Lie 6 &mdash; The errors are cached too &mdash; or worse, they aren't

What does `lru_cache` do when the wrapped function raises?

Nothing. The next call retries. Which sounds correct, until your downstream API has a 30-minute incident and your agent calls it 400 times per user per minute, each call burning a tool-call budget, a rate-limit quota, and a chunk of the model's context window on retry traces.

What does the obvious fix &mdash; "let me cache the exceptions too" &mdash; do? It caches the 500 from a transient blip for `maxsize` calls. The API recovered ninety seconds ago. Your agent is still returning the cached error.

Negative caching is a real design problem. You need:

- Short TTLs on errors.
- Separate policies per error class.
- A way to distinguish *this query has no result* (cacheable for a long time) from *the upstream is down* (cacheable for thirty seconds) from *this user is rate-limited* (cacheable until the rate-limit window resets, which the response told you).

`lru_cache` makes a single binary choice &mdash; cache successes only &mdash; and that choice is wrong in both directions depending on traffic.

---

## Lie 7 &mdash; It doesn't work with `async` at all

```python
@lru_cache(maxsize=1024)
async def get_inventory(sku: str) -> int:
    return await shopify.inventory.get(sku=sku)
```

This caches the coroutine object, not the awaited result. The first caller awaits it and gets a value. The second caller gets the same coroutine and a `RuntimeError: cannot reuse already awaited coroutine`. Every subsequent caller gets the same error, forever, until eviction.

You can wrap with `asyncio.Lock` and a manual dict and a `try/finally` and a single-flight key set, and you will, and it will be subtly wrong in some way you find out about in three months under load. The standard library does not give you an async-correct memoize.

> Most agent frameworks are async. Most production tool calls are network I/O. `lru_cache` is for the wrong shape of function.

---

## Lie 8 &mdash; It dies with the process

`lru_cache` lives in process memory. Restart the worker, the cache is empty. Spin up a second worker, it has its own cache. Run on serverless, every cold start pays full price.

The shape you actually want &mdash; a hot in-process tier backed by a warm shared tier (Redis, or similar) backed by the truth &mdash; `functools` cannot give you, because `functools` is a single dictionary in a single process. And the moment you stand up the warm tier yourself, you've reintroduced every problem above (canonicalization, tenancy, TTLs, invalidation, negative caching, async correctness) at a layer where they are harder to see.

---

## What you actually need

Pulling on these threads, the shape of the real problem comes into view. Caching tool calls inside an agent loop is its own problem space, and a credible solution needs:

| Primitive | What it does |
|---|---|
| **Canonicalization** | Normalize arguments before keying &mdash; sort, coerce, strip defaults. |
| **Side-effect classification** | Writes are never cached. Reads-with-side-effects are cached carefully. |
| **Tenant scoping** | Per-principal salts, mixed into every key. |
| **Per-tool, per-key TTLs** | Ideally adapted from observed staleness, not hard-coded. |
| **Webhook-driven invalidation** | For any tool whose source of truth emits change events. |
| **Negative caching** | Separate policies for "no result," "upstream down," and "rate-limited." |
| **Async-correct, multi-tier storage** | A hot in-process layer over a shared warm layer. |
| **Observability** | Good enough to answer "why did this hit (or miss)" six months from now. |

None of that is in `functools`. Most of it is not in your `from redis import Redis` either, unless you write it.

> If you have an agent in production and you have not built all eight of those things, your `lru_cache` is lying to you. Probably about something embarrassing. Probably to a user.
