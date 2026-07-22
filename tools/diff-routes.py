#!/usr/bin/env python3
"""Diff routes in capabilities.json vs 03-CONTRACTS.md §2. caps.json wins on disagreements."""
import json, re

with open('docs/capabilities/capabilities.json') as f:
    caps = json.load(f)

# Normalize: strip /api prefix, standardize :param wildcards
cap_paths = {}
for r in caps['rest']:
    p = r['path'].replace('/api/', '/').lstrip('/')
    key = (r['method'], p)
    cap_paths[key] = r

# Parse 03-CONTRACTS.md §2 routes
with open('specs/03-CONTRACTS.md') as f:
    text = f.read()

# Section 2 starts after "## 2." and ends before "## 3."
sec2 = text.split('## 2.')[1].split('## 3.')[0] if '## 2.' in text else ''

# Extract routes from the bullet list
spec_routes = {}
current_group = None
for line in sec2.split('\n'):
    # Group headers: "- auth:", "- config:", etc.
    m = re.match(r'^\s*-\s*(\w+):\s*(.+)', line)
    if m:
        current_group = m.group(1)
        route_text = m.group(2)
    elif line.strip().startswith('- ') and not line.strip().startswith('- auth:'):
        # Contination line without group name
        continue
    
    if m:
        # Parse route patterns: `METHOD path` or `METHOD path `{...}``
        # Find all METHOD path patterns
        for route_match in re.finditer(r'`(\w+)\s+([^`]+)`', route_text):
            method = route_match.group(1).upper()
            path = route_match.group(2).strip()
            path = path.lstrip('/')  # normalize
            spec_routes[(method, path)] = current_group, route_text

print("=== SPEC routes from 03-CONTRACTS.md §2 ===")
for (m, p), (group, _) in sorted(spec_routes.items()):
    print(f"  {m} /{p}  [{group}]")

print(f"\n=== DISAGREEMENTS (caps.json wins) ===")
disagree = False
# Check every spec route against caps
for (m, p), (group, orig) in sorted(spec_routes.items()):
    if (m, p) not in cap_paths:
        print(f"  SPEC-ONLY: {m} /{p} [{group}] — NOT in caps.json")
        disagree = True

# Check every caps route against spec  
for (m, p), r in sorted(cap_paths.items()):
    if (m, p) not in spec_routes:
        print(f"  CAPS-ONLY: {m} /{p} (status={r['status']}) — NOT in spec")
        disagree = True

if not disagree:
    print("  NONE — all routes agree")

print(f"\nSpec routes: {len(spec_routes)}, Caps routes: {len(cap_paths)}")