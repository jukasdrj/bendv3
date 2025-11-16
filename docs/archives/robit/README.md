# AI-Powered Development Setup

**Complete AI workflow for BooksTrack Backend**

---

## Quick Start

### 1. Understand the Setup (3 min)
Read: **[AI_SETUP_README.md](./AI_SETUP_README.md)** - Overview of all AI tools and costs

### 2. Apply to This Project (DONE ✅)
The setup has been applied to this backend repo with:
- `.claude/CLAUDE.md` - Backend-specific guidelines
- Pre-commit hooks for JavaScript/Cloudflare Workers
- GitHub labels for backend components
- Issue templates for bugs, features, performance
- Copilot Review workflow
- Jules and AI collaboration guides

**See:** **[AI_SETUP_COMPLETE.md](./AI_SETUP_COMPLETE.md)** for what was created

### 3. Fix Deployment (5 min)
**[⚠️ DEPLOYMENT-FIX.md](../../DEPLOYMENT-FIX.md)** - Fix Secrets Store permission error

Your deployment is failing because the Cloudflare API token needs `Workers Secrets: Edit` permission. Follow the guide to fix this.

### 4. Run Label Script (1 min)
```bash
.github/scripts/create-labels.sh
```

Creates all 47 GitHub labels in the repository.

### 5. Start Using AI Tools
- **GitHub Copilot:** In your IDE (VS Code, JetBrains)
- **Claude Code:** In terminal (you're using it now!)
- **Jules:** On GitHub PRs - `@jules review this PR`
- **Zen MCP:** Via Claude Code - `mcp zen codereview --files src/handlers/search.js`

---

## Documentation Structure

```
docs/robit/
├── README.md                    # This file - Start here
├── AI_SETUP_README.md           # Original guide (from Flutter project)
├── AI_SETUP_COMPLETE.md         # What was created for backend
├── WORKFLOW_SUMMARY.md          # Quick workflow overview
├── GITHUB_ZEN_SETUP.md          # GitHub + Zen MCP setup
└── EXPORT_TO_SWIFT.md           # Export to iOS/Flutter repos
```

---

## File Locations

### Claude Code Setup
- **Guidelines:** `.claude/CLAUDE.md`
- **Pre-commit hook:** `.claude/hooks/pre-commit.sh`
- **Prompts:** `.claude/prompts/*.md`

### GitHub Integration
- **Labels script:** `.github/scripts/create-labels.sh`
- **Issue templates:** `.github/ISSUE_TEMPLATE/*.yml`
- **Workflows:** `.github/workflows/copilot-review.yml`
- **Jules guide:** `.github/JULES_GUIDE.md`
- **AI collaboration:** `.github/AI_COLLABORATION.md`

### Backend Documentation
- **API Reference:** `docs/API_README.md`
- **Architecture:** `MONOLITH_ARCHITECTURE.md`
- **Deployment:** `DEPLOYMENT.md`
- **Secrets Setup:** `SECRETS_SETUP.md`

---

## Usage Patterns

### Daily Development

**1. Write code (GitHub Copilot in IDE)**
```javascript
// Type comment, Copilot suggests code
// Validate ISBN before search
const isValid = validateISBN(isbn)
```

**2. Refactor to standards (Claude Code)**
```bash
"Refactor search handler to follow CLAUDE.md patterns"
```

**3. Validate (Zen MCP)**
```bash
mcp zen codereview --files src/handlers/search.js --review-type security
```

**4. Create PR and review (Jules)**
```markdown
@jules review this search handler for:
- Cloudflare Workers best practices
- Performance (< 500ms)
- Error handling
```

### Feature Development

**1. Plan (Zen MCP Planner)**
```bash
mcp zen planner --feature "Add Goodreads search provider"
```

**2. Implement (Copilot + Claude Code)**
- Copilot autocompletes as you type
- Claude Code refactors for consistency

**3. Test (Manual + Zen MCP)**
```bash
# Local testing
npm run dev
curl http://localhost:8787/v1/search/isbn?isbn=9780439708180

# AI validation
mcp zen codereview --review-type performance
```

**4. Deploy (GitHub Actions)**
```bash
git push origin feature/goodreads-provider
gh pr create
# Auto-deploys on merge to main
```

### Debugging

**1. Reproduce locally**
```bash
npm run dev
# Test endpoint
```

**2. Check logs**
```bash
npx wrangler tail --remote
```

**3. Deep debug (Zen MCP)**
```bash
mcp zen debug --issue "Batch enrichment fails at 50 ISBNs"
```

**4. Fix (Claude Code)**
```bash
"Fix batch enrichment to handle large batches without timeout"
```

---

## Cost Optimization

### Free Tier (80% of work)
- **GitHub Copilot:** Autocomplete in IDE
- **Claude Code with Haiku:** Refactoring, following CLAUDE.md
- **Jules:** PR reviews

### Mid-Tier (15% of work)
- **Zen MCP with Grok Code:** Quick analysis
- **Zen MCP with Gemini PC:** Standard reviews

### Premium (5% of work)
- **Zen MCP with Gemini 2.5 Pro:** Security audits
- **Zen MCP with O3 Pro:** Complex planning
- **Zen MCP with Grok 4:** Architecture decisions

**Monthly Cost:** ~$2-5 in API calls (vs $50-100 without optimization)

---

## Next Steps

### Immediate (Today)
1. ✅ AI setup applied to backend
2. ⚠️ Fix deployment (Secrets Store permission)
3. ⏳ Run label script
4. ⏳ Test first workflow (create issue, label it)

### This Week
1. Use Claude Code for next feature
2. Request Jules review on next PR
3. Try Zen MCP code review
4. Monitor AI tool usage and costs

### Next Month
1. Export setup to iOS repo
2. Export setup to Flutter frontend repo
3. Refine CLAUDE.md based on learnings
4. Add custom prompts for common tasks

---

## Export to Other Projects

### iOS Frontend
```bash
cd ~/Downloads/xcode/books-tracker-v1

# Copy AI setup
cp -r ~/Downloads/xcode/bookstrack-backend/.claude .
cp -r ~/Downloads/xcode/bookstrack-backend/.github/scripts .
cp ~/Downloads/xcode/bookstrack-backend/.github/JULES_GUIDE.md .github/
cp ~/Downloads/xcode/bookstrack-backend/.github/AI_COLLABORATION.md .github/

# Update CLAUDE.md for Swift/SwiftUI
# Update pre-commit hook for swiftlint
# Update component labels for iOS
```

**See:** [EXPORT_TO_SWIFT.md](./EXPORT_TO_SWIFT.md) for full guide

### Flutter Frontend
```bash
cd ~/path/to/flutter-frontend

# Same process, adapt for Flutter/Dart
# Update CLAUDE.md for Flutter patterns
# Update pre-commit hook for flutter analyze
# Update component labels for Flutter
```

**Estimated time per project:** 2-3 hours

---

## Troubleshooting

### Pre-commit Hook Not Running
```bash
ls -la .git/hooks/pre-commit
# Should show symlink to .claude/hooks/pre-commit.sh

# Reinstall if needed
ln -sf ../../.claude/hooks/pre-commit.sh .git/hooks/pre-commit
chmod +x .claude/hooks/pre-commit.sh
```

### Deployment Failing
**See:** [DEPLOYMENT-FIX.md](../../DEPLOYMENT-FIX.md)

TL;DR: Add `Workers Secrets: Edit` permission to Cloudflare API token

### GitHub Labels Not Created
```bash
# Check authentication
gh auth status

# Login if needed
gh auth login

# Run script
.github/scripts/create-labels.sh
```

### Jules Not Responding
- Verify GitHub Copilot Plus subscription is active
- Check you're commenting on actual PR (not issue)
- Try simpler request: `@jules review this PR`
- Wait 5 minutes (may be rate limited)

### Zen MCP Errors
- Check `~/.zen/config.json` exists
- Verify API keys are set (Google, OpenAI, X.AI)
- Check model name is correct: `mcp zen listmodels`

---

## Resources

### Documentation
- **Claude Code:** https://docs.claude.com/claude-code
- **GitHub Copilot:** https://docs.github.com/copilot
- **Jules:** https://docs.github.com/copilot/using-github-copilot/asking-github-copilot-questions
- **Zen MCP:** https://github.com/BeehiveInnovations/zen-mcp-server
- **Cloudflare Workers:** https://developers.cloudflare.com/workers/

### Guides in This Repo
- **Backend Guidelines:** `.claude/CLAUDE.md`
- **Jules Usage:** `.github/JULES_GUIDE.md`
- **AI Workflow:** `.github/AI_COLLABORATION.md`
- **Code Review Prompt:** `.claude/prompts/code-review.md`
- **Debug Prompt:** `.claude/prompts/debug-issue.md`
- **Planning Prompt:** `.claude/prompts/plan-feature.md`

---

## Support

### Issues with AI Tools
- **Claude Code:** https://github.com/anthropics/claude-code/issues
- **Zen MCP:** https://github.com/BeehiveInnovations/zen-mcp-server/issues
- **GitHub Copilot:** https://support.github.com/

### Questions About This Setup
- Check `AI_SETUP_COMPLETE.md` for detailed info
- Review `.claude/CLAUDE.md` for backend patterns
- Read `.github/AI_COLLABORATION.md` for workflows

---

## Success Metrics

Track these to measure AI tool impact:

### Development Speed
- Time to implement features (before vs after AI)
- Number of PRs per week
- Lines of code written per day

### Code Quality
- Number of bugs in production
- Security issues caught before deployment
- Test coverage percentage

### Cost Efficiency
- Monthly AI API costs (target: $2-5)
- Time saved vs cost of tools
- ROI calculation

---

**You're all set!** 🎉

The BooksTrack backend now has a world-class AI development workflow.

**Next:** Fix deployment, then start using the tools!

---

**Last Updated:** November 13, 2025
**Status:** ✅ Setup Complete, ⚠️ Deployment Pending
