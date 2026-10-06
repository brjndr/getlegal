---
name: cerebras
description: Use this to write code to call an LLM using LiteLLM and OpenRouter with the Cerebras inference provider
---

# Calling an LLM via Cerebras

These instructions allow you write code to call an LLM with Cerebras specified as the inference provider.  
This method uses LiteLLM and OpenRouter.

## Setup

The OPENROUTER_API_KEY must be set in the .env file and loaded in as an environment variable.  

The uv project must include litellm and pydantic.
`uv add litellm pydantic`

## Code snippets

Use code like these examples in order to use Cerebras.

### Imports and constants

```python
from litellm import completion
MODEL = "openrouter/openai/gpt-oss-120b"
EXTRA_BODY = {"provider": {"order": ["cerebras"], "allow_fallbacks": False}}
MAX_TOKENS = 2000  # Size this to the longest answer you expect
```

`allow_fallbacks: False` matters: without it OpenRouter silently uses another provider whenever
Cerebras turns a request down, and those providers have returned corrupted Structured Outputs.
Always pass `max_tokens` too. Left unset, Cerebras reserves its full output limit (about 40,000
tokens), which an account that is low on credit cannot cover, so the request is turned down.

### Code to call via Cerebras for a text response

```python
response = completion(model=MODEL, messages=messages, reasoning_effort="low", extra_body=EXTRA_BODY, max_tokens=MAX_TOKENS)
result = response.choices[0].message.content
```

### Code to call via Cerebras for a Structured Outputs response

```python
response = completion(model=MODEL, messages=messages, response_format=MyBaseModelSubclass, reasoning_effort="low", extra_body=EXTRA_BODY, max_tokens=MAX_TOKENS)
result = response.choices[0].message.content
result_as_object = MyBaseModelSubclass.model_validate_json(result)
```