# Buyer product discovery across Shopify merchants

The buyer describes a product in voice or text. The agent opens Shopping with
`{"catalog":true,"query":"wireless headphones","budget":1500}`. The page searches
Shopify **Global Catalog** and shows selectable cards with product images, merchant,
price and an external product link. Budget is optional and is always Thai baht.
The home also has **เลือกสินค้า · Shopify** for direct use without a live voice agent.

No merchant store, sales subscription, development store or store URL is required.
No carts, orders, customer accounts or payments are created. Selecting a card only
marks the buyer's choice; following its product link is a separate owner action.
Product discovery uses Shopify Global Catalog only; general live web search is not enabled.

The server calls `search_catalog` at `https://catalog.shopify.com/api/ucp/mcp` with an
agent profile and no API key. The local demo uses Shopify's documented hosted example
profile. Before production, host our own UCP profile and set `SHOPIFY_AGENT_PROFILE_URL`
to its public HTTPS URL. No Shopify CLI login or Partner organization is required for
this keyless discovery path. Custom saved catalogs/credentials are optional and separate.

Search is limited to available products shipping to Thailand, with THB localization.
An explicit budget is sent in minor units and checked against returned variants too;
other currencies are displayed as returned when no baht budget is supplied. Not every
Shopify merchant/product is eligible or indexed. Shipping, duties and final pricing must
be checked at the merchant. Do not invent results when a query returns no products.

Results are not cached. Product images render directly from merchant/CDN URLs alongside
the corresponding listings and are not downloaded or stored by the server. The existing
daily call limits, HTTPS link checks, request timeout, and scene cancellation apply.

Official reference: https://shopify.dev/docs/agents/catalog/global-catalog
