---
title: "The $500B problem your 1M context window didn't cost"
description: "Why training a model natively on 1M context would cost $500 billion, how positional embeddings work from first principles, and the surprisingly cheap path models actually take."
date: 2026-06-22
draft: false
---

Have you ever wondered how your model handles 1M context? Did they train it on such a huge dataset, or fine-tune it?

You can eliminate the training idea with one rough back-of-the-envelope:

Llama 3 was trained on roughly 15 trillion tokens at 8K context. Rough cost estimate: ~$50M.

Now calculate the cost multiplier for 1M context:

```
(1,000,000 / 8,000)² = 125² = 15,625
```

And since not everything is quadratic (FFN, embeddings, etc. are linear), a more realistic multiplier is around 10,000x.

```
Estimated cost of native 1M pre-training:
  = $50M × 10,000
  = $500 Billion
```

And that's assuming the hardware and the data for this kind of training even exists. It doesn't.

---

## OK so fine-tuning then?

Fine-tuning is partially correct - but it hits the same hardware wall immediately. Hundreds of GBs of VRAM for KV cache and backprop activations for 1M-length sequences.

But even if you somehow solved the hardware problem, fine-tuning has a deeper issue: **position is baked into the weights.**

During pre-training the model never saw a token beyond position 8192. Its weights learned to interpret a specific range of positional signals. At position 500K, the model isn't just guessing - it's like asking someone to read a clock that suddenly has 50,000 hours on it instead of 12. The hands are pointing somewhere completely unfamiliar and the intuition for reading clocks is suddenly useless.

Fine-tuning can't cleanly fix this because the same weights that were trained to handle position 5 are now asked to handle position 500K, and updating them to make sense of one actively breaks the other.

So before we get to the actual solution, we need to understand how models encode position in the first place.

---

## How do models understand token position?

Transformers process all tokens simultaneously. There's no inherent sense of order.

(There's a camp that claims models can develop an understanding of position without being explicitly shown it, and they're not completely wrong - but for pure transformer-based models, we need to be explicit.)

The solution is **positional embeddings** - a vector added to each token's representation encoding where it sits in the sequence.

What do we need from positional encoding? A unique fingerprint for every position. So we need some function that produces a different value for every position number we plug into it.

---

## The naive approaches

**Approach 1: just use the position number itself**

```
Position 1   → 1
Position 2   → 2
Position 500 → 500
```

But you can't just add 500 to a token embedding and expect it to retain any meaning. The number 500 would completely overpower whatever semantic information the embedding carries.

**Approach 2: normalize it**

```
Position 1   → 1/512  = 0.00195
Position 256 → 256/512 = 0.5
Position 512 → 512/512 = 1.0
```

Bounded between 0 and 1, but something else is broken. During training at length 512, position 256 maps to 0.5. During inference on a 1024-length sequence, position 256 maps to 256/1024 = 0.25. Everything the model learned about position 256 is now broken.

**The actual problem: it's the scalar.**

We're trying to encode position as a single number and asking it to do everything at once - be unique, be bounded, encode relative distance. That's too much to ask from one number.

---

## Give each position a vector

Position 1 → `[?, ?, ?, ..., ?]` - 512 numbers, each capturing something different.

We need a function that generates these 512 numbers for any given position. First property required: **bounded**. How about sine and cosine?

They're bounded, deterministic, and generalisable. But they repeat every 2π ≈ 6.28 positions - they're not unique at all.

The fix: use many sine and cosine waves at **different speeds simultaneously**. Make the value inside each sin/cos travel from 0 to 2π at different speeds.

---

## Sinusoidal embeddings

The most naive attempt at this:

```
Position 1 → [sin(1), sin(1), sin(1), ..., sin(1)]
Position 2 → [sin(2), sin(2), sin(2), ..., sin(2)]
```

But these still aren't unique - it's the same scalar problem, just repeated 512 times. Position 1 and position 7 get nearly identical values.

We need different values across dimensions at the same position. The solution: **use different frequencies so the same wave moves differently across dimensions.**

```
Dim 0 → sin(pos × freq_0)
Dim 1 → sin(pos × freq_1)
Dim 2 → sin(pos × freq_2)
...
```

Now we need to choose those frequencies carefully.

If all frequencies are fast, every dimension completes a full cycle every 6 positions, and by position 5000 every dimension has wrapped around hundreds of times. Position 5000 and 5003 might look identical, or worse, position 1 and position 5000 get the same fingerprint.

If all frequencies are slow, nearby positions become indistinguishable.

**Get both.** Fast dimensions handle nearby distinctions, slow dimensions handle distant ones.

And since sin and cos always come in pairs (because sin(30°) = sin(150°) = 0.5, so you need both to uniquely identify a position within a cycle), the structure is:

```
dim 2i   = sin(pos / 10000^(2i/d_model))
dim 2i+1 = cos(pos / 10000^(2i/d_model))
```

Why linearly spaced frequencies don't work: you'd have 200+ pairs bunched between 0.1 and 0.9, all medium speed, barely different from each other. Instead, space them exponentially - each pair proportionally slower than the last, covering a wide range.

The original paper chose frequencies so that:
- The fastest pair completes a cycle every ~6 positions.
- The slowest pair completes a cycle every ~62,832 positions (10,000 × 2π).
- Everything in between is spaced exponentially.

---

## Three ways sinusoidal embeddings fall apart

**1. The mixing problem**

When you add a position vector to the token embedding, the two get entangled into a single vector. The model now has to understand from one number both "what this token means" and "where this token is." Both Q and K contain this mixture, and the model has to untangle it from inside the dot product Q @ K.T. Somehow this even works, which is why some people join the positional embedding denier camp.

**2. The generalisation problem**

The model trained on positions 0 to 8192. For each position it learned a specific sinusoidal fingerprint and the attention patterns that go with it. At inference time position 10000 arrives - a fingerprint that never appeared during training. Sin and cos are smooth functions so you can mathematically extrapolate them, but the model's weights weren't trained for that region and performance degrades.

**3. The relative distance problem**

This is the most fundamental one. What attention actually needs isn't "token A is at position 47 and token B is at position 51" but rather "token A and token B are 4 positions apart."

There's a trigonometric identity that makes this almost solvable:

```
sin(a + b) = sin(a)cos(b) + cos(a)sin(b)
cos(a + b) = cos(a)cos(b) - sin(a)sin(b)
```

Which means: if you know sin(47) and cos(47), and you know the offset 4, you can compute sin(51) using multiplications and additions alone. So the fingerprint of position 51 can be expressed in terms of the fingerprint of position 47 plus a fixed transformation that depends on the gap of 4.

Technically, the model could recover relative distance from the fingerprints. But *technically recoverable* isn't the same as *actually learned reliably*. We shouldn't expect the model to figure this out on its own if we can just hand it to them.

---

## RoPE

The core idea: rather than adding a position vector to the token embedding, **rotate the token vector by an angle proportional to its position.**

**Start in 2D**

Token "cat" at position 3 has embedding [0.9, 0.4]. In 2D, rotating a vector by angle θ is straightforward:

```
x_rotated = x·cos(θ) - y·sin(θ)
y_rotated = x·sin(θ) + y·cos(θ)
```

RoPE rotates each token's vector by an angle proportional to its position:

```
Position 1 → rotate by 1·θ
Position 2 → rotate by 2·θ
Position n → rotate by n·θ
```

The same "cat" token at position 3 gets rotated by 3θ; at position 7 it gets rotated by 7θ. The meaning is preserved - just pointing in a different direction depending on position.

**The magic is in attention**

Attention computes a score between tokens as `score = Q · K`. With RoPE:

- Q of a token at position m is rotated by angle m.
- K of a token at position n is rotated by angle n.

The geometric property of dot products: the result depends not on the individual angles m and n, but only on their **difference** (m − n). So when attention computes Q · K, the result reflects how far apart the two tokens are - not where they individually are. **Relative distance is guaranteed by geometry, not learned by the model.**

This also fixes the mixing problem: position is encoded in the *direction* of the vector, not mixed into its *values*.

**Scaling to 512 dimensions**

You can't rotate a 512D vector the same way you rotate a 2D one. RoPE handles this by splitting the 512 dimensions into 256 pairs and rotating each pair independently - each pair has its own 2D plane:

```
[dim 0,   dim 1]   → rotate by position × freq_0
[dim 2,   dim 3]   → rotate by position × freq_1
...
[dim 510, dim 511] → rotate by position × freq_255
```

Same reason as sinusoidal: some pairs rotate fast (good at nearby distinctions), some rotate slow (good at distant ones), frequencies spaced exponentially:

```
freq_i = 1 / 10000^(2i/d_model)
```

For dimension pair i at position m:

```
θ = m × freq_i

new_x = x·cos(θ) - y·sin(θ)
new_y = x·sin(θ) + y·cos(θ)
```

Do this for all 256 pairs. That's RoPE.

---

## Why RoPE extrapolates better - but still breaks

The sinusoidal problem was showing an unfamiliar absolute fingerprint at position 10000. RoPE doesn't show absolute fingerprints anymore - it shows relative ones. A gap of 50 looks the same whether it occurs at position 100 or position 10000. The model has seen many gap sizes across many different absolute positions during training.

But it still breaks, specifically for the **slow-rotating pairs**.

Fast pairs: a gap of 50 produces a meaningful rotation angle, and the model has seen it many times. Fine.

Slow pairs: they rotate so little that even the maximum training gap of 8192 only moves them about 47° of a full 360°. The angles they produce for gaps beyond 8192 are angles the model genuinely never saw, because no training sequence was longer than that.

```
Fast pair: gap of 8192 → wraps around hundreds of times → all angles seen
Slow pair: gap of 8192 → moves only ~47° of 360°       → most angles never seen
```

Same fundamental problem as sinusoidal, just pushed further out and isolated to the slow pairs.

---

## The fix: slow them down

The insight: if the slow pairs are producing angles the model never saw during training, scale down their frequencies so that far-out positions map back to angles the model already knows.

For a slow pair with some small frequency, here's what the model saw during training:

```
position 0    → angle = 0°
position 1000 → angle = 2.9°
position 8192 → angle = 23.8°
```

Now during inference, position 50000 arrives:

```
position 50000 → angle = 145°   ← never seen
```

Scale the frequency down by 32:

```
new angle = 145° / 32 = 4.5°   ← well within training range
```

You can't slow down all pairs though - the fast ones are fine, and slowing them would break nearby-position distinctions. You need to be selective: aggressive scaling on slow pairs, minimal or zero scaling on fast pairs.

---

## But scaling frequencies alone isn't enough

You've fixed the angle problem mathematically. But the model's weights were still never trained on long-range dependencies. A slow pair might now produce a familiar angle at position 50000, but the model has never practiced assessing a gap of 50,000. The geometry is fixed; the weights are still unfamiliar with the gap.

The actual production recipe is three things together:

1. **RoPE scaling** - fix the angle distribution so far-out positions look familiar
2. **Short continued retraining** - let the weights adjust to long-range dependencies
3. **Carefully curated long-context data** - documents that actually require long-range understanding

This is how Llama 3 went from 8K to 128K - not one big training run, but staged extension. RoPE scaling plus weight updates at each stage, using 800 billion tokens in total for the extension phase alone.

---

## Then Cerebras showed it was wasteful

Meta used 800 billion tokens to extend Llama 3 to 128K context. Cerebras came along and showed the same performance was achievable with under 10 billion tokens - using smarter synthetic data generation, position ID shifting, and better RoPE base frequency tuning.

That's 80x cheaper.

Which means the $500 billion native pre-training becomes cheaper than $50 million with the right set of techniques.

The math for context extension doesn't scale with the training budget. It scales with how well you understand what the model actually needs to learn.
