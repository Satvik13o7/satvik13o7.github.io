---
title: "AI Slop Is Gonna Kill AI! Stop!!"
description: "How recursive self-training and the flood of model-generated content can collapse model behavior — experiments, metrics, and practical fixes."
date: 2026-07-06
draft: false
---

## AI Slop Is Gonna Kill AI! Stop!!

Let me set the premise: there's a lot of buzz that AI will replace human workers, including software engineers. Current models aren't close to fully replacing skilled engineers; the real risk is not a sudden takeover but a slow degradation of the data distribution the models train on. When model outputs flood training corpora, future models can learn from increasingly degraded data — a self-reinforcing loop.

### The Neural Scaling Laws

Neural scaling laws show validation loss L often follows power laws when you scale:

Model size
$$
L = L_{\infty} + a\,N^{-\alpha}
$$

Dataset size
$$
L = L_{\infty} + b\,D^{-\beta}
$$

Compute
$$
L = L_{\infty} + c\,C^{-\gamma}
$$

These relationships assume the data distribution is stable. If the distribution is changing — because models are trained on their own outputs — scaling predictions break.

## The Experiment (summary)

- Base model: Qwen/Qwen2.5-Coder-0.5B-Instruct (fused as the fixed judge).
- Platform: Apple Silicon (MLX).
- Recursive self-training across generations 0..6: generate 3,000 samples per generation, filter/parse, fine-tune (epochs=2, batch_size=2, lr=2e-5), repeat.
- Metrics: perplexity under gen‑0 judge, parse rate, MMD (embeddings), tail-collapse stats (AST rare features), intrinsic dimension (TwoNN), and correlations.

## Results — key figures

![Median perplexity by generation with shaded p10–p90 band; median rises from 1.39 (gen0) to 2.01 (gen6) and spread increases](/assets/ai-slop/blog_perplexity_drift.png)

![Overlaid histograms of per-sample perplexity for gen0 and gen6 showing a rightward shift of the distribution](/assets/ai-slop/blog_distribution_shift.png)

Perplexity (judge-model) rises steadily across generations: later outputs are increasingly "surprising" to the original model. The upper tail (p90) grows fastest and the variance increases ≈×5, showing failure modes amplify rather than uniformly degrade.

![Line chart of parse rate by generation showing a gradual downward trend](/assets/ai-slop/blog_parse_rate.png)

Parse rate falls slowly (≈94.7% → 85.6%), meaning syntactic validity degrades but more slowly than semantic/behavioral quality.

![MMD between generations and gen-0; rising trend](/assets/ai-slop/mmd.png)

MMD (RBF kernel) increases monotonically: the semantic distribution of generated programs drifts away from gen‑0 in embedding space.

![Count of gen-0 rare AST features missing entirely by generation; number rises across generations](/assets/ai-slop/tail_missing.png)
![Total occurrences / mean frequency of gen-0 rare features decreasing across generations](/assets/ai-slop/tail_rare_frequency.png)

Rare features (bottom 10% in gen‑0) decline in occurrence and many disappear entirely — a clear signal of tail collapse.

![Estimated intrinsic dimension (TwoNN) decreasing across generations](/assets/ai-slop/intrinsic_dimension.png)

TwoNN estimates show the embedding manifold contracts (≈17 → 13), indicating outputs occupy fewer semantic degrees of freedom over generations.

![Scatter of mean perplexity vs MMD (left) and mean perplexity vs intrinsic dimension (right)](/assets/ai-slop/scatter_ppl_vs_mmd.png)
![Scatter of mean perplexity vs intrinsic dimension](/assets/ai-slop/scatter_ppl_vs_idim.png)

Correlations are strong: mean PPL vs MMD r≈0.99, mean PPL vs rare-feature frequency r≈−0.96, mean PPL vs intrinsic dimension r≈−0.89 — the metrics co-vary and jointly witness the collapse.

## Takeaway

Repeatedly training on model-generated data collapses the learned distribution: common artifacts are amplified, rare but valuable behaviors vanish, and the model's effective semantic space shrinks. This breaks scaling-law assumptions that rely on a stable data distribution.

Practical mitigations are straightforward: always retain a vetted fraction of human data in training mixes, deduplicate and filter model-generated content aggressively, limit full fine‑tune exposure (or use constrained updates like LoRA), and monitor judge‑based PPL, MMD, tail metrics, and intrinsic dimension to detect drift early.

---

If you want, I can:

1. Tweak copy or length to match your other posts.
2. Move or rename images, and produce a two‑column figure layout if you prefer side‑by‑side panels in the rendered site.
3. Open a PR or commit this post file to your repo (already added) and show the exact Git commands to publish.
