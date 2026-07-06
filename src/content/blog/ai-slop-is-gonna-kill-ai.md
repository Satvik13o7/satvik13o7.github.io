---
title: "AI Slop is gonna kill AI! Stop!!"
description: "How AI slop is polluting training data: recursive self‑training causes semantic drift, tail collapse and manifold contraction-leading to model degradation."
date: 2026-07-06
draft: false
---

The motivation for the experiment performed in this blog post comes from - *"Chasing Shadows: Pitfalls in LLM Security Research"* (arXiv:2512.09549)

## AI Slop is gonna kill AI! Stop!! 

Let me set the premise here for what I am about to explain - so there is a lot of buzz around AI replacing human workers, for instance software engineers. But we know pretty well that the current AI systems we have are not good enough to actually replace software engineers (well at least the good ones) and the whole reason why companies like Anthropic are worth trillions of dollars is because the bet is on the future - that there will be a time the models will be good enough to replace us. There are already two camps of people - one which claim that the LLMs are the way to AGI and mass unemployment (and these people are mostly doing fearmongering to make money) and the other camp which believes that the LLMs are not it and we would need some other form of machine learning to achieve AGI and I am here to explain why the second camp might be more logical and correct. 

### The philosophical perspective 

An American philosopher Victor Reppert in his book C.S. Lewis's Dangerous Idea writes the following paragraph's (20 years before the advent of LLMs) - 

"If you were to meet a person, call him Steve, who could argue with great cogency for every position he held, you might on that account be inclined to consider him a very rational person." 

"But suppose it turned out that on all disputed questions Steve rolled dice to fix his positions permanently and then used his reasoning abilities only to generate the best available arguements for those beliefs selected in the above-mentioned random method. I think that such a discovery would prompt you to withdraw from him the honorific title 'rational'." 

Now, if you have even a little idea of how LLMs work you would easily be able to correlate the above description with the 'reasoning' in LLMs.

### The Neural Scaling Laws 

Neural scaling laws describe how a model's performance (usually measured by validation loss) changes as you scale three main resources:

    1. Model size (number of parameters, N)
    2. Dataset size (number of training tokens/examples, D)
    3. Training compute (FLOPs, C)

The surprising finding is that these relationships follow power laws over many orders of magnitude.

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

So basically using these power law relations you can predict what combination of model size, dataset size and compute will be able to achieve a human level performance which in itself is not a measurable metric but it can help you push in the right direction. But there is a problem in this scaling law which stops it from scaling and predicting the performance of future models - the quality of the data distribution. 

## The Changing Data Distribution

One thing that suprised me was the fact that the number of AI generated articles on the internet has surpassed that of human written. And I guess that might be the case in other domains as well - especially coding.

![Illustration showing the growing fraction of AI-generated content on the web](public/assets/ai-slop/number_of_ai_articles.png)

Now why do we care about this? Why do we care for the amount of AI slop that is there on the internet? 

### The intrinsic dimension 

Let's say the vocabulary of my training data is 1000 and the dimension I am using to encode these is also 1000 - and this basically means that every thing in my training data lives in this 1 million dimensional space. But does this mean that if you sample any random point from this 1M-dimensional space you would get something meaningful? the answer is NO! it will be a random noise. Only a subset of points from this 1M-dimensional space would actually mean something. 

Ok let me explain with a simple example - 

Consider a sheet of paper - the sheet exists in 3 dimensions (howsoever small is the third dimension), but moving on the sheet only requires 2 coordinates. 

So, 

    - while the ambient dimension of the paper = 3 
    - its intrinsic dimension = 2 

And exactly the same idea applies to our natural language data. Natural language lives in a ridiculously high dimensional space but the meaningful language lives in far fewer dimensions and these might roughly correspond to things like - syntax, semantics, style, factual content, topics etc. 

The intrinsic dimension is the minimum number of latent variables needed to describe the data distribution. And the LLMs task is to learn this manifold lying in that high dimensional space as smoothly as possible. In that manifold or the data distribution there are both types of things - common and rare and since the LLM sees the common ones in higher numbers it learns that part of the manifold way more smoothly than the part which consists of rarer things.

### The AI Slop and the eventual Model Collapse 

So our LLM has learned this manifold of data distribution - smoothly for the common things and kinda rough for the rare ones. Then it goes out and start generating more data which goes on the internet and gets added into the data distribution. And this causes the common things to become even more common in the data distribution while the rarer ones diminish even more. 

Now our next model learns from this skewed data distribution - generates more skewed data - which in turn skewes the distribution even more and this goes on and on until the original data distribution is completely lost. 

So the repeated training on recursively generated data disproportionately erodes the low probability tails (rarer figures) of the original data distribution and the future models are no longer learning the original manifold but a simplified one with low intrinsic dimension as a few dimensions are lost. 

**The Model Collapses under its own shit.** 

Below is an example which shows the degradation in performance of a model recursively trained on the data it generated itself.

![Perplexity drift (median with p10–p90 band)](/assets/ai-slop/blog_perplexity_drift.png)


## The Experiments 

### The Setup 

    - Base model: Qwen/Qwen2.5-Coder-0.5B-Instruct (fused into runs/model_gen0 and used as the fixed judge).   
    
    - Protocol: recursive self-training across generations 0..6 (7 total). Each generation: generate 3,000 samples, filter/parse, then fine-tune the model on that generated set and produce the next generation.  
    
    - Generation sampler: temperature = 0.7, top_p = 0.95, max_tokens = 512.  
    
    - Fine-tuning recipe (per-generation): full fine‑tune (not LoRA), epochs = 2, batch_size = 2, max_seq_length = 1024, learning_rate = 2e-5. Training iterations per generation ≈ 3000 (computed as samples × epochs / batch_size).


## The Metrics 

**Perplexity**
- mean_ppl - mean per-sample perplexity under the fixed judge model (average surprise).  
- median_ppl - median per-sample perplexity (robust central tendency).  
- p10_ppl - 10th percentile perplexity (lower-tail performance).  
- p90_ppl - 90th percentile perplexity (upper-tail / worst-case surprise).  
- var_ppl - variance of per-sample perplexities (how dispersed the loss distribution is).  
- raw per-sample PPL list (runs/ppl_raw_gen{N}.json) - full per-example perplexities for distribution plots.

**Parsing**
- parse_rate - fraction of generated programs that are syntactically valid (AST parse success).

**Distributional**
- MMD - Maximum Mean Discrepancy between generation embeddings and gen‑0 (measures semantic distribution drift).

**Tail Collapse**
- total_rare_occurrences - total counts of features defined as “rare in gen0” found in a generation (measures frequency loss).  
- mean_freq - mean frequency (normalized) of those rare features in a generation (tracks decline of rare features).  
- missing_rare_features - number (or percent) of gen0 rare features completely absent in a generation.

**Geometry**
- intrinsic_dimension - TwoNN estimate of the embedding manifold dimension (effective semantic degrees of freedom).

**Correlations & summary statistics**
- Pearson / Spearman correlations (e.g. mean PPL vs MMD, mean PPL vs intrinsic_dimension, mean PPL vs rare-feature frequency) - quantify linear/monotonic association strength between metrics.  
- n (sample count per generation) - number of examples used for each metric (affects estimation variance).

### The Perplexity 

<div style="display:flex;gap:1rem;align-items:flex-start">
  <figure style="flex:1;margin:0">
    <img src="/assets/ai-slop/blog_perplexity_drift.png" alt="Median perplexity by generation with shaded p10–p90 band; median rises from 1.39 (gen0) to 2.01 (gen6) and spread increases">
    <figcaption>Perplexity drift (median with p10–p90 band).</figcaption>
  </figure>
  <figure style="flex:1;margin:0">
    <img src="/assets/ai-slop/blog_distribution_shift.png" alt="Overlaid histograms of per-sample perplexity for gen0 and gen6 showing a rightward shift of the distribution">
    <figcaption>Distribution shift: gen0 vs gen6.</figcaption>
  </figure>
</div>

The judge-model perplexity rises steadily across generations, meaning later generations are increasingly “surprising” to the original (gen‑0) model - the generated code distribution drifts away from the human-like distribution the judge represents.  

The upper tail (p90) grows fastest while the median also shifts upward, so degradation is uneven: a growing fraction of outputs become substantially worse while many remain similar.  

Variance increases strongly (0.029 → 0.151, ≈×5), which shows the failure modes amplify rather than a uniform, gradual decay - rare or brittle behaviors disappear and a few bad modes dominate.


### Parse Rate 

Parse rate falls slowly (≈94.7% → 85.6%), showing syntax remains relatively robust while semantics/quality degrade; a declining parse rate means more generated programs become syntactically invalid over generations.

![Line chart of parse rate by generation showing a gradual downward trend](/assets/ai-slop/blog_parse_rate.png)


### MMD (Maximum Mean Discrepancy)

MMD measures how far the generation embeddings drift from gen‑0 in embedding space; an increasing MMD means the semantic distribution of generated programs moves away from the original distribution.

![Bar/line chart of MMD by generation rising from zero at gen0 to higher values by later generations](/assets/ai-slop/mmd.png)


### Tail collapse (rare feature metrics)

Rare-feature metrics track whether features that were rare in gen‑0 (bottom 10% frequency) persist. Total occurrences and mean frequency falling while missing rare features rise means the model loses uncommon but important patterns first.

<div style="display:flex;gap:1rem;align-items:flex-start">
  <figure style="flex:1;margin:0">
    <img src="/assets/ai-slop/tail_missing.png" alt="Count of gen-0 rare AST features missing entirely by generation; number rises across generations">
    <figcaption>Missing gen‑0 rare features by generation.</figcaption>
  </figure>
  <figure style="flex:1;margin:0">
    <img src="/assets/ai-slop/tail_rare_frequency.png" alt="Total occurrences / mean frequency of gen-0 rare features decreasing across generations">
    <figcaption>Frequency of gen‑0 rare features by generation.</figcaption>
  </figure>
</div>


### Intrinsic dimension

TwoNN intrinsic-dimension estimates how many effective semantic degrees of freedom the embeddings occupy; a drop (≈17.1 → 13.4) means later generations occupy a lower-dimensional subspace - outputs become less varied semantically.

<figure>
  <img src="/assets/ai-slop/intrinsic_dimension.png" alt="Estimated intrinsic dimension (TwoNN) of generation embeddings decreasing from ~17.1 to ~13.4 across generations">
  <figcaption>Intrinsic-dimension (TwoNN) by generation.</figcaption>
</figure>


### Correlations / joint plots

Strong correlations (e.g, mean PPL vs MMD r≈0.99, mean PPL vs rare-feature frequency r≈−0.96, mean PPL vs intrinsic dimension r≈−0.89) show the metrics co-vary: rising perplexity accompanies semantic drift, loss of rare features, and manifold contraction. These associations strengthen the interpretation that the metrics witness the same collapse phenomenon.

<div style="display:flex;gap:1rem;align-items:flex-start">
  <figure style="flex:1;margin:0">
    <img src="/assets/ai-slop/scatter_ppl_vs_mmd.png" alt="Scatter of mean perplexity vs MMD with fitted trend line showing strong positive correlation">
    <figcaption>Mean PPL vs MMD.</figcaption>
  </figure>
  <figure style="flex:1;margin:0">
    <img src="/assets/ai-slop/scatter_ppl_vs_idim.png" alt="Scatter of mean perplexity vs intrinsic dimension with fitted trend line showing strong negative correlation">
    <figcaption>Mean PPL vs intrinsic dimension.</figcaption>
  </figure>
</div>


## Conclusion 

So basically all the slop on the internet - all those AI generated articles and coding agent slop projects are polluting the very thing that helped create the AI in the first place. 

Ok so there are two things to conclude from this experiment - 

1. The most important one being - for the most part AI is reliable and good enough but there will always be some things some obscure things that the model will not get right. And the "always" plays a big role here and requires a human expertise to fill that gap. 

2. It's not like this is not fixable - we are not going to get into that here but there are a bunch of things that researchers are working on to counter this, consider OpenAI's reearch on detecting LLM generated text or you might have recently heard that they are internally tagging the AI generated images from their model. 
