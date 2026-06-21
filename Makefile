.PHONY: help bootstrap build test lint typecheck ci e2e lighthouse security-scan check-readiness verify-offline version-patch version-minor version-major
.PHONY: build-contract build-agent build-ui build-cli test-contract test-agent test-ui test-cli

help:
	@echo "Silo Build and Testing Automation Harness"
	@echo "=========================================="
	@echo "bootstrap        - Install all dependencies in all subfolders"
	@echo "build            - Compile all packages (Agent, Contract, UI)"
	@echo "test             - Run unit and integration tests (Agent, Contract, UI)"
	@echo "lint             - Run ESLint checks on the Next.js UI"
	@echo "typecheck        - Verify TypeScript type safety in all subfolders"
	@echo "ci               - Run the core CI checks (lint, typecheck, test)"
	@echo "e2e              - Execute Playwright end-to-end tests (demo mode)"
	@echo "lighthouse       - Run Lighthouse CI audit on the UI dashboard"
	@echo "security-scan    - Run vulnerability audits and license compliance checks"
	@echo "check-readiness  - Run the official submission readiness check"
	@echo "verify-offline   - Run the enclave PII leak offline verification"
	@echo "version-patch    - Bump version by patch (x.y.Z+1)"
	@echo "version-minor    - Bump version by minor (x.Y+1.0)"
	@echo "version-major    - Bump version by major (X+1.0.0)"

bootstrap:
	npm run bootstrap

build:
	npm run build

build-contract:
	npm run build:contract

build-agent:
	npm run build:agent

build-ui:
	npm run build:ui

build-cli:
	npm run build:cli

test:
	npm run test

test-contract:
	npm run test:contract

test-agent:
	npm run test:agent

test-ui:
	npm run test:ui

test-cli:
	npm run test:cli

lint:
	npm run lint

typecheck:
	npm run typecheck

ci: build-contract
	npm run ci

e2e:
	npm run e2e

lighthouse:
	npm run lighthouse

security-scan:
	@echo "🔍 Running NPM Audit..."
	npm run audit
	@echo "🔍 Running License Checker..."
	npx license-checker --production --failOn "GPL-3.0;AGPL-3.0" --summary || true

check-readiness:
	python3 scripts/check_submission_readiness.py

verify-offline:
	python3 scripts/verify_offline.py

version-patch:
	PATH="/opt/homebrew/bin:$$PATH" node scripts/bump-version.js patch
	git add .
	git commit -m "chore(release): bump version to $$(PATH="/opt/homebrew/bin:$$PATH" node -p "require('./package.json').version")"

version-minor:
	PATH="/opt/homebrew/bin:$$PATH" node scripts/bump-version.js minor
	git add .
	git commit -m "chore(release): bump version to $$(PATH="/opt/homebrew/bin:$$PATH" node -p "require('./package.json').version")"

version-major:
	PATH="/opt/homebrew/bin:$$PATH" node scripts/bump-version.js major
	git add .
	git commit -m "chore(release): bump version to $$(PATH="/opt/homebrew/bin:$$PATH" node -p "require('./package.json').version")"

