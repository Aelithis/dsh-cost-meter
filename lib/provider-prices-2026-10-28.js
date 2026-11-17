// Official provider-scoped additions and corrections checked 2026-10-28. USD / MTok, with published CNY quotes where available.
export const PROVIDER_PRICE_UPDATES_2026_10_28 = {
  "opencode-zen": {
    "models": {
      "glm-5.3-flash-free": {
        "billingMode": "flat",
        "input": 0,
        "output": 0,
        "cachedInput": 0,
        "sourceUrl": "https://opencode.ai/v2/docs/console/models/",
        "checkedAt": "2026-10-28"
      },
      "beam-free": {
        "billingMode": "flat",
        "input": 0,
        "output": 0,
        "cachedInput": 0,
        "sourceUrl": "https://opencode.ai/v2/docs/console/models/",
        "checkedAt": "2026-10-28"
      },
      "flint-40b-free": {
        "billingMode": "flat",
        "input": 0,
        "output": 0,
        "cachedInput": 0,
        "sourceUrl": "https://opencode.ai/v2/docs/console/models/",
        "checkedAt": "2026-10-28"
      },
      "nemotron-3.5-super-vl-free": {
        "billingMode": "flat",
        "input": 0,
        "output": 0,
        "cachedInput": 0,
        "sourceUrl": "https://opencode.ai/v2/docs/console/models/",
        "checkedAt": "2026-10-28"
      },
      "kimi-k3": {
        "billingMode": "flat",
        "sourceUrl": "https://opencode.ai/v2/docs/console/models/",
        "checkedAt": "2026-10-28",
        "input": 3,
        "output": 15,
        "cachedInput": 0.3,
        "cacheWrite": 3
      },
      "muse-wonder-1.0": {
        "billingMode": "flat",
        "input": 4,
        "output": 20,
        "cachedInput": 0.2,
        "sourceUrl": "https://opencode.ai/v2/docs/console/models/",
        "checkedAt": "2026-10-28"
      },
      "gpt-6.1-sol": {
        "input": 2,
        "output": 10,
        "cachedInput": 0.1,
        "cacheWrite": 2.5,
        "longContext": {
          "aboveInputTokens": 272000,
          "cacheMiss": 4,
          "cacheHit": 0.2,
          "output": 15,
          "cacheWrite": 5
        },
        "billingMode": "flat",
        "sourceUrl": "https://opencode.ai/v2/docs/console/models/",
        "checkedAt": "2026-10-28"
      }
    }
  },
  "opencode-go": {
    "models": {
      "kimi-k3.1-pro": {
        "billingMode": "flat",
        "input": 2,
        "output": 10,
        "cachedInput": 0.2,
        "cacheWrite": 2,
        "sourceUrl": "https://opencode.ai/v2/docs/console/go/",
        "checkedAt": "2026-10-28"
      },
      "kimi-k3": {
        "billingMode": "flat",
        "sourceUrl": "https://opencode.ai/v2/docs/console/go/",
        "checkedAt": "2026-10-28",
        "input": 3,
        "output": 15,
        "cachedInput": 0.3,
        "cacheWrite": 3
      },
      "step-5-preview": {
        "billingMode": "flat",
        "input": 1,
        "output": 2.7,
        "cachedInput": 0.1,
        "sourceUrl": "https://opencode.ai/v2/docs/console/go/",
        "checkedAt": "2026-10-28"
      },
      "beam-free": {
        "billingMode": "flat",
        "input": 0,
        "output": 0,
        "cachedInput": 0,
        "sourceUrl": "https://opencode.ai/v2/docs/console/go/",
        "checkedAt": "2026-10-28"
      },
      "iceman-contributor-free": {
        "billingMode": "flat",
        "input": 0,
        "output": 0,
        "cachedInput": 0,
        "sourceUrl": "https://opencode.ai/v2/docs/console/go/",
        "checkedAt": "2026-10-28"
      },
      "minimax-m3.1-flash": {
        "billingMode": "flat",
        "input": 0.15,
        "output": 0.6,
        "cachedInput": 0.015,
        "sourceUrl": "https://opencode.ai/v2/docs/console/go/",
        "checkedAt": "2026-10-28"
      },
      "gemini-4-argon": {
        "billingMode": "flat",
        "input": 2,
        "output": 10,
        "cachedInput": 0.1,
        "sourceUrl": "https://opencode.ai/v2/docs/console/go/",
        "checkedAt": "2026-10-28",
        "notes": "OpenCode Go promotional price through 2026-11-30. USD 2/10/0.1 per MTok; independent of the direct API."
      }
    }
  },
  "moonshot": {
    "models": {
      "kimi-k3.1-pro": {
        "input": 2,
        "cachedInput": 0.2,
        "output": 10,
        "billingMode": "flat",
        "sourceUrl": "https://platform.kimi.ai/docs/pricing/chat",
        "checkedAt": "2026-10-28",
        "cacheWrite": 2,
        "cny": {
          "cacheMiss": 13,
          "cacheHit": 1.3,
          "cacheWrite": 13,
          "output": 68
        },
        "notes": "Kimi API official USD quote and China CNY quote: https://www.kimi.com/resources/kimi-k3-1-pro-pricing. Default 5m cache writes; 1h cache write is USD 4 / CNY 26 per MTok. 1M context uses the same rate."
      },
      "kimi-k3.1-pro-highspeed": {
        "input": 4,
        "cachedInput": 0.2,
        "output": 20,
        "billingMode": "flat",
        "sourceUrl": "https://platform.kimi.ai/docs/pricing/chat",
        "checkedAt": "2026-10-28",
        "cacheWrite": 4,
        "cny": {
          "cacheMiss": 26,
          "cacheHit": 1.3,
          "cacheWrite": 26,
          "output": 136
        },
        "notes": "Kimi API Highspeed. Default 5m cache writes; 1h cache write is USD 8 / CNY 52 per MTok. China quote: https://www.kimi.com/resources/kimi-k3-1-pro-pricing"
      },
      "kimi-k3": {
        "input": 3,
        "cachedInput": 0.3,
        "output": 15,
        "billingMode": "flat",
        "sourceUrl": "https://platform.kimi.ai/docs/pricing/chat",
        "checkedAt": "2026-10-28",
        "cacheWrite": 3,
        "cny": {
          "cacheMiss": 20,
          "cacheHit": 2,
          "cacheWrite": 20,
          "output": 100
        },
        "notes": "Default 5m cache writes. 1h cache write is USD 6 / CNY 40 per MTok. China quote: https://www.kimi.com/resources/kimi-k3-1-pro-pricing"
      },
      "k3.1-pro": {
        "input": 2,
        "cachedInput": 0.2,
        "output": 10,
        "billingMode": "flat",
        "sourceUrl": "https://www.kimi.com/code/docs/kimi-code/models.html",
        "checkedAt": "2026-10-28",
        "cacheWrite": 2,
        "cny": {
          "cacheMiss": 13,
          "cacheHit": 1.3,
          "cacheWrite": 13,
          "output": 68
        },
        "notes": "Kimi Code model ID; direct Kimi API price is a token-equivalent reference. Subscription quota comes from the usage API. Kimi API official USD quote and China CNY quote: https://www.kimi.com/resources/kimi-k3-1-pro-pricing. Default 5m cache writes; 1h cache write is USD 4 / CNY 26 per MTok. 1M context uses the same rate."
      },
      "k3.1-pro-highspeed": {
        "input": 4,
        "cachedInput": 0.2,
        "output": 20,
        "billingMode": "flat",
        "sourceUrl": "https://www.kimi.com/code/docs/kimi-code/models.html",
        "checkedAt": "2026-10-28",
        "cacheWrite": 4,
        "cny": {
          "cacheMiss": 26,
          "cacheHit": 1.3,
          "cacheWrite": 26,
          "output": 136
        },
        "notes": "Kimi Code model ID; direct Kimi API price is a token-equivalent reference. Subscription quota comes from the usage API. Kimi API Highspeed. Default 5m cache writes; 1h cache write is USD 8 / CNY 52 per MTok. China quote: https://www.kimi.com/resources/kimi-k3-1-pro-pricing"
      },
      "k3": {
        "input": 3,
        "cachedInput": 0.3,
        "output": 15,
        "billingMode": "flat",
        "sourceUrl": "https://www.kimi.com/code/docs/kimi-code/models.html",
        "checkedAt": "2026-10-28",
        "cacheWrite": 3,
        "cny": {
          "cacheMiss": 20,
          "cacheHit": 2,
          "cacheWrite": 20,
          "output": 100
        },
        "notes": "Kimi Code model ID; direct Kimi API price is a token-equivalent reference. Subscription quota comes from the usage API. Default 5m cache writes. 1h cache write is USD 6 / CNY 40 per MTok. China quote: https://www.kimi.com/resources/kimi-k3-1-pro-pricing"
      },
      "k3-256k": {
        "unpriced": true,
        "billingMode": "flat",
        "sourceUrl": "https://www.kimi.com/code/docs/kimi-code/models.html",
        "checkedAt": "2026-10-28",
        "notes": "Kimi Code 256K subscription model. No separate direct API token-equivalent quote."
      },
      "kimi-for-coding": {
        "unpriced": true,
        "billingMode": "flat",
        "sourceUrl": "https://www.kimi.com/code/docs/kimi-code/models.html",
        "checkedAt": "2026-10-28",
        "notes": "Kimi Code currently routes this ID to K2.8 Preview. No published direct API quote."
      },
      "kimi-for-coding-highspeed": {
        "unpriced": true,
        "billingMode": "flat",
        "sourceUrl": "https://www.kimi.com/code/docs/kimi-code/models.html",
        "checkedAt": "2026-10-28",
        "notes": "Kimi Code K2.7 Code Highspeed subscription ID. Quota usage is queried separately."
      }
    }
  },
  "minimax": {
    "models": {
      "minimax-m3.1-flash": {
        "input": 0.15,
        "cachedInput": 0.015,
        "output": 0.6,
        "billingMode": "flat",
        "sourceUrl": "https://platform.minimax.io/docs/pricing/overview",
        "checkedAt": "2026-10-28",
        "cny": {
          "cacheMiss": 1,
          "cacheHit": 0.1,
          "output": 4
        },
        "notes": "MiniMax M3.1 Flash Standard API. China CNY quote: https://platform.minimax.cn/docs/pricing/overview . M3.1 Flash Preview is retired and requests are served by M3.1 Flash."
      },
      "minimax-m3.1-flash-preview": {
        "input": 0.15,
        "cachedInput": 0.015,
        "output": 0.6,
        "billingMode": "flat",
        "sourceUrl": "https://platform.minimax.io/docs/pricing/overview",
        "checkedAt": "2026-10-28",
        "cny": {
          "cacheMiss": 1,
          "cacheHit": 0.1,
          "output": 4
        },
        "notes": "MiniMax M3.1 Flash Standard API. China CNY quote: https://platform.minimax.cn/docs/pricing/overview . M3.1 Flash Preview is retired and requests are served by M3.1 Flash."
      }
    }
  },
  "tencent": {
    "models": {
      "hy4-preview": {
        "input": 0.834,
        "cachedInput": 0.042,
        "output": 2.501,
        "billingMode": "flat",
        "sourceUrl": "https://intl.cloud.tencent.com/document/product/1300/78937",
        "checkedAt": "2026-10-28",
        "notes": "TokenHub Singapore published USD rate. Regional rates and Token Plan credits are separate."
      }
    }
  },
  "alibaba": {
    "models": {
      "qwen3.8-flash": {
        "input": 0.15,
        "cachedInput": 0.016,
        "output": 0.47,
        "cacheWrite": 0.2,
        "billingMode": "flat",
        "sourceUrl": "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
        "checkedAt": "2026-10-28",
        "notes": "Singapore International USD quote, including explicit and implicit cache prices: https://www.alibabacloud.com/help/en/model-studio/qwen3-8-flash . Mainland and global deployment rates differ."
      }
    }
  }
}

PROVIDER_PRICE_UPDATES_2026_10_28.openrouter = {
  "models": {
    "moonshotai/kimi-k3.1-pro": {
      "input": 2,
      "output": 10,
      "billingMode": "flat",
      "sourceUrl": "https://openrouter.ai/api/v1/models",
      "checkedAt": "2026-10-28",
      "cachedInput": 0.2,
      "notes": "OpenRouter public model-list token quote checked 2026-10-28. Endpoint-specific tool fees are separate."
    },
    "minimax/minimax-m3.1-flash": {
      "input": 0.15,
      "output": 0.6,
      "billingMode": "flat",
      "sourceUrl": "https://openrouter.ai/api/v1/models",
      "checkedAt": "2026-10-28",
      "cachedInput": 0.015,
      "notes": "OpenRouter public model-list token quote checked 2026-10-28. Endpoint-specific tool fees are separate."
    },
    "nvidia/nemotron-3.5-super-vl": {
      "input": 0.15,
      "output": 0.5,
      "billingMode": "flat",
      "sourceUrl": "https://openrouter.ai/api/v1/models",
      "checkedAt": "2026-10-28",
      "cachedInput": 0.02,
      "notes": "OpenRouter public model-list token quote checked 2026-10-28. Endpoint-specific tool fees are separate."
    },
    "nvidia/nemotron-3.5-super-vl:free": {
      "input": 0,
      "output": 0,
      "billingMode": "flat",
      "sourceUrl": "https://openrouter.ai/api/v1/models",
      "checkedAt": "2026-10-28",
      "notes": "OpenRouter public model-list token quote checked 2026-10-28. Endpoint-specific tool fees are separate."
    },
    "meta/muse-wonder": {
      "input": 4,
      "output": 20,
      "billingMode": "flat",
      "sourceUrl": "https://openrouter.ai/api/v1/models",
      "checkedAt": "2026-10-28",
      "cachedInput": 0.2,
      "notes": "OpenRouter public model-list token quote checked 2026-10-28. Endpoint-specific tool fees are separate."
    }
  }
}
