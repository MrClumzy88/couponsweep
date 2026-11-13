// H-E-B adapter.
//
// Listing: the all-coupons page is a Next.js page, and its data endpoint
// (/_next/data/<buildId>/…json) returns 60 coupons per page with a cursor list
// for the rest. `clippedStatus` is only included when you're signed in.
//
// Clipping: HEB's GraphQL endpoint accepts a plain (non-persisted) CouponClip
// mutation, so nothing here depends on query hashes that change on deploy.

(() => {
  const LIST_PATH = "digital-coupon/coupon-selection/all-coupons";
  const CLIP = "mutation CouponClip($id: Int) { clip(id: $id) { __typename ... on CouponV2 { id clippedStatus } } }";
  const CLIP_GROUP = "mutation GroupCouponClip($id: Int!) { clipGroup(id: $id) { __typename } }";

  function buildId() {
    if (window.__NEXT_DATA__?.buildId) return window.__NEXT_DATA__.buildId;
    const el = document.getElementById("__NEXT_DATA__");
    try { return JSON.parse(el.textContent).buildId; } catch { return null; }
  }

  async function listPage(id, query, ctx) {
    const url = `/_next/data/${id}/en/${LIST_PATH}.json?${query}`;
    const r = await fetch(url, { credentials: "include", headers: { "x-nextjs-data": "1" } });
    if (r.status === 404) throw ctx.fail("error", "H-E-B just updated its site. Reload the coupons page and try again.");
    if (!r.ok) throw ctx.fail("blocked", `H-E-B refused the coupon list (HTTP ${r.status}). Open the coupons page, then try again.`);
    return (await r.json())?.pageProps || {};
  }

  async function gql(query, variables) {
    const r = await fetch("/graphql", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!r.ok) return { httpStatus: r.status };
    return r.json();
  }

  window.__gbc.register({
    id: "heb",
    name: "H-E-B",
    isCouponPage: () => location.pathname.startsWith("/digital-coupon"),

    async run(ctx) {
      const id = buildId();
      if (!id) throw ctx.fail("error", "Couldn't read the H-E-B page. Open heb.com/digital-coupon and try again.");

      // Page 1, then every cursor the pagination block lists (deduped).
      const coupons = new Map();
      const queue = ["pageName=all-coupons"];
      const seenQueries = new Set(queue);
      let signedIn = false;
      while (queue.length) {
        const props = await listPage(id, queue.shift(), ctx);
        for (const c of props.couponData || []) {
          if ("clippedStatus" in c) signedIn = true;
          coupons.set(c.id, c);
        }
        for (const p of props.pagination?.pages || []) {
          const q = (p.to || "").split("?")[1];
          if (q && !seenQueries.has(q)) { seenQueries.add(q); queue.push(q); }
        }
        ctx.status(`Loading coupons… ${coupons.size} so far`);
        await ctx.sleep(ctx.between(250, 500));
      }
      if (!signedIn) throw ctx.fail("login", "Sign in to heb.com first, then run again.");

      const all = [...coupons.values()];
      const todo = all.filter((c) => c.clippedStatus !== "CLIPPED");
      ctx.found(all.length, all.length - todo.length);

      // Meal-deal style coupons belong to a group that's clipped as one.
      const groupsDone = new Set();
      for (const c of todo) {
        const groupId = c.groupDetails?.groupId;
        if (groupId && groupsDone.has(groupId)) continue;
        await ctx.clip(async () => {
          const res = groupId
            ? await gql(CLIP_GROUP, { id: Number(groupId) })
            : await gql(CLIP, { id: c.id });
          if (res.httpStatus === 403 || res.httpStatus === 429) {
            throw ctx.fail("blocked", "H-E-B started refusing requests. Wait a few minutes and run again.");
          }
          const err = res.errors?.[0];
          if (err?.extensions?.code === "UNAUTHENTICATED") throw ctx.fail("login", "Your H-E-B sign-in expired. Sign in and run again.");
          if (err) { console.log("[CouponSweep] HEB clip failed", c.id, err.message); return false; }
          const typename = groupId ? res.data?.clipGroup?.__typename : res.data?.clip?.__typename;
          return typename === "CouponV2" || typename === "CouponGroup";
        }, [300, 700], ctx.dollarsOff(c));
        if (groupId) groupsDone.add(groupId);
      }
    },
  });
})();
