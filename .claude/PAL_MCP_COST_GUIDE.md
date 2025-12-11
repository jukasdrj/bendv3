# PAL MCP Cost Optimization Guide

**Quick Reference:** How to minimize API costs when using PAL MCP tools

---

## 🎯 **Golden Rules**

1. **Run Claude Code in Haiku or Sonnet** (NOT Opus/OpusPlan)
2. **Use Grok 4 as default external model** (cheapest via X.AI)
3. **Use single-model tools** (avoid consensus unless critical)
4. **Use `thinking-mode: medium`** (not `high` or `max`)

---

## 💰 **Cost Hierarchy (Cheapest to Most Expensive)**

### **Claude Code Orchestration** (Anthropic billing)
1. ✅ **Haiku** - Best for PAL MCP work (external models do heavy lifting)
2. ✅ **Sonnet** - Good balance for complex synthesis
3. ❌ **Opus/OpusPlan** - AVOID! Maxes out quota quickly

### **External Models via PAL MCP** (Direct API billing)
1. ✅ **Grok 4** (X.AI) - **CHEAPEST** - Use as default
2. ⚠️ **Gemini 2.5 Pro** (Google AI) - More expensive, use when Grok insufficient
3. ❌ **Multi-model consensus** - Most expensive, critical decisions only

---

## 📋 **Model Selection Decision Tree**

### **For Code Review:**
```bash
# DEFAULT (cheapest)
claude --model haiku
# Then call:
mcp pal codereview --model "grok-4" --thinking-mode medium

# If Grok misses issues:
mcp pal codereview --model "gemini-2.5-pro" --thinking-mode medium
```

### **For Debugging:**
```bash
# DEFAULT (cheapest)
claude --model haiku
# Then call:
mcp pal debug --model "grok-4" --thinking-mode high

# For complex race conditions or multi-system issues:
mcp pal debug --model "gemini-2.5-pro" --thinking-mode high
```

### **For Planning:**
```bash
# SIMPLE FEATURES (< 3 files)
claude --model haiku
# No PAL MCP needed - Claude Code direct

# COMPLEX FEATURES (3-10 files)
claude --model sonnet
# Or with PAL MCP:
mcp pal planner --model "grok-4" --thinking-mode medium

# MAJOR REFACTORS (> 10 files)
claude --model sonnet
mcp pal planner --model "grok-4" --thinking-mode high
```

### **For Consensus (Use Sparingly!):**
```bash
# CRITICAL DECISIONS ONLY
claude --model sonnet  # Never use Opus for consensus orchestration!
mcp pal consensus \
  --models "grok-4,gemini-2.5-pro" \  # Max 2 models
  --prompt "Critical architectural decision..."
```

---

## 💡 **Cost Breakdown Examples**

### **Scenario 1: Code Review**

**❌ Old Pattern (Expensive):**
```bash
# Claude Code in OpusPlan mode
claude --model opusplan

mcp pal codereview \
  --model "gemini-2.5-pro" \
  --thinking-mode high

# Cost:
# - Opus orchestration: ~2.5K tokens ($$$)
# - Gemini: ~10K tokens ($$)
# - TOTAL: Very High
```

**✅ New Pattern (Cost-Optimized):**
```bash
# Claude Code in Haiku mode
claude --model haiku

mcp pal codereview \
  --model "grok-4" \
  --thinking-mode medium

# Cost:
# - Haiku orchestration: ~1K tokens ($)
# - Grok: ~8K tokens ($ - cheapest!)
# - TOTAL: Low
# - SAVINGS: ~85-90%
```

---

### **Scenario 2: Multi-Model Consensus**

**❌ Old Pattern (Very Expensive):**
```bash
# Claude Code in Opus mode
claude --model opus

mcp pal consensus \
  --models "gemini-2.5-pro,o3-pro,grok-4"

# Cost:
# - Opus orchestration: ~5K tokens ($$$$)
# - Gemini: ~15K tokens ($$)
# - O3 Pro: ~15K tokens ($$$)
# - Grok: ~10K tokens ($)
# - TOTAL: Very Very High
```

**✅ New Pattern (Still Expensive, But Better):**
```bash
# Claude Code in Sonnet mode
claude --model sonnet

mcp pal consensus \
  --models "grok-4,gemini-2.5-pro"  # Only 2 models!

# Cost:
# - Sonnet orchestration: ~3K tokens ($$)
# - Grok: ~10K tokens ($)
# - Gemini: ~15K tokens ($$)
# - TOTAL: Medium-High
# - SAVINGS: ~60-70%
```

**✅ Best Pattern (Avoid Consensus When Possible):**
```bash
# Try single model first!
claude --model haiku

mcp pal codereview --model "grok-4"

# If insufficient, escalate to Gemini
mcp pal codereview --model "gemini-2.5-pro"

# Only use consensus as last resort
# Cost: ~85% cheaper than multi-model consensus
```

---

## 🚨 **Common Mistakes**

### **Mistake 1: Running Opus/OpusPlan for PAL MCP Work**
❌ **DON'T:**
```bash
claude --model opus  # Expensive orchestration!
mcp pal codereview --model "grok-4"
```

✅ **DO:**
```bash
claude --model haiku  # Cheap orchestration
mcp pal codereview --model "grok-4"
```

**Why:** Grok does the heavy analysis. Haiku just packages the request/response.

---

### **Mistake 2: Using Gemini as Default**
❌ **DON'T:**
```bash
mcp pal debug --model "gemini-2.5-pro"  # More expensive!
```

✅ **DO:**
```bash
mcp pal debug --model "grok-4"  # Cheaper!
```

**When to use Gemini:**
- Multi-modal analysis (images, diagrams)
- Very large context windows needed
- Grok gave insufficient results

---

### **Mistake 3: Using Consensus for Everything**
❌ **DON'T:**
```bash
# For routine code review
mcp pal consensus --models "grok-4,gemini-2.5-pro,..."
```

✅ **DO:**
```bash
# Single model first
mcp pal codereview --model "grok-4"

# Consensus ONLY for critical decisions
# - Security vulnerabilities
# - Major architecture choices
# - Production incident analysis
```

---

## 📊 **Monthly Cost Estimates**

Based on typical BooksTrack development workflow:

### **Before Optimization:**
```
Claude Code: Opus/OpusPlan mode
External Models: Gemini default, frequent consensus

Estimated Monthly Cost:
- Anthropic (Claude): $200-400/month (Opus usage)
- Google AI (Gemini): $100-150/month
- X.AI (Grok): $50-80/month
TOTAL: $350-630/month
```

### **After Optimization:**
```
Claude Code: Haiku/Sonnet mode
External Models: Grok default, rare consensus

Estimated Monthly Cost:
- Anthropic (Claude): $30-60/month (Haiku/Sonnet usage)
- Google AI (Gemini): $20-40/month (rare use)
- X.AI (Grok): $80-120/month (primary use)
TOTAL: $130-220/month

SAVINGS: ~65-70% ($220-410/month saved!)
```

---

## 🎯 **Quick Start Checklist**

When starting a new Claude Code session:

- [ ] Check current model: `/model`
- [ ] If Opus/OpusPlan → Switch to Haiku or Sonnet
- [ ] For PAL MCP work → Use Haiku (cheapest orchestration)
- [ ] For complex synthesis → Use Sonnet
- [ ] Default external model → `grok-4`
- [ ] Thinking mode → `medium` (unless complex issue)
- [ ] Consensus → Only for critical decisions

---

## 🔍 **Debugging High Costs**

If you're still seeing high Opus usage:

1. **Check your active model:**
   ```bash
   /model
   # Look for: "Opus Plan Mode" - if enabled, DISABLE IT
   ```

2. **Review recent usage:**
   ```bash
   /usage
   # Look at token breakdown by model
   ```

3. **Check session logs:**
   ```bash
   # Look for "claude-opus" in recent sessions
   grep -r "claude-opus" ~/.claude/projects/*/
   ```

4. **Verify PAL MCP calls:**
   ```bash
   # Should see "grok-4" as model, NOT "gemini-2.5-pro"
   grep -r "mcp__pal" ~/.claude/projects/*/ | grep "model"
   ```

---

## 📚 **Additional Resources**

- PAL MCP Model Pricing: `mcp pal listmodels`
- Claude Code Model Selector: `/model`
- Usage Tracking: `/usage`
- Cost Analysis: Review `.claude/projects/*/` session logs

---

**Last Updated:** November 14, 2025
**Cost Structure:** Grok (cheapest) → Gemini (more expensive) → Consensus (most expensive)
**Orchestration:** Haiku (cheapest) → Sonnet (balanced) → Opus (avoid!)
