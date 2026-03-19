#!/bin/bash
# Seed legacy pages into R2 as markdown
# Run from creston-worker/ directory:
#   bash config/seed-pages.sh

BUCKET="crestoniowa"
echo "Seeding pages into R2 bucket: $BUCKET"

# About page
wrangler r2 object put "$BUCKET/pages/about.md" --file=config/pages/about.md
echo "✅ about.md"

# Government page  
wrangler r2 object put "$BUCKET/pages/government.md" --file=config/pages/government.md
echo "✅ government.md"

# Chamber page
wrangler r2 object put "$BUCKET/pages/chamber.md" --file=config/pages/chamber.md
echo "✅ chamber.md"

echo ""
echo "Done! Pages are now at:"
echo "  creston-iowa.com/about"
echo "  creston-iowa.com/government"
echo "  creston-iowa.com/chamber"
echo ""
echo "Or use the admin migration tool at /admin/pages/migrate"
