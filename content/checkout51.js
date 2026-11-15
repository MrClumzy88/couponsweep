// Checkout 51 upload page helper (www.checkout51.com/account/upload).
//
// When the user presses "Fill in Checkout 51" for a receipt in the popup,
// the popup saves { ids, label, at } as c51Prefill and opens this page. Here
// CouponSweep ticks those offers the way the user would (each offer is
// li#offer-<id>; clicking its .checkbox sets claims[<id>] to 1) and shows a
// note. The user attaches the photo of their paper receipt and submits:
// CouponSweep never uploads or submits anything.

(async () => {
  const { c51Prefill: p } = await chrome.storage.local.get("c51Prefill");
  if (!p || (!p.ids?.length && !p.image) || Date.now() - p.at > 30 * 60 * 1000) return;

  const waitFor = async (test, ms) => {
    for (let t = 0; t < ms; t += 300) {
      if (test()) return true;
      await new Promise((r) => setTimeout(r, 300));
    }
    return test();
  };
  if (!(await waitFor(() => document.querySelector('input[name^="claims["]'), 15000))) return;

  // The picture of the store's own receipt (with its barcode), if CouponSweep
  // took one: put it in the page's photo picker as if the user had chosen it.
  // The page opens on an instructions step; its "Got It? Let's Go!" link
  // (#step/2) shows the photo uploader. The uploader reads the file on
  // "change", shows it as a preview and clears the input again.
  let attached = false;
  if (p.image) {
    document.querySelector('a[href="#step/2"]')?.click();
    await waitFor(() => document.querySelector(".step-upload.active"), 3000);
    const input = document.querySelector('input[type="file"][name="pic1"], input[type="file"]');
    if (input) {
      try {
        const blob = await (await fetch(p.image)).blob();
        const dt = new DataTransfer();
        dt.items.add(new File([blob], p.imageName || "receipt.png", { type: "image/png" }));
        input.files = dt.files;
        const before = document.querySelectorAll(".step-upload img").length;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        attached = await waitFor(() => document.querySelectorAll(".step-upload img").length > before, 5000);
      } catch (e) {
        console.log("[CouponSweep] attach", e);
      }
    }
  }

  const ticked = [];
  const missing = [];
  for (const id of p.ids) {
    const li = document.getElementById(`offer-${id}`);
    const input = li?.querySelector(`input[name="claims[${id}]"]`);
    if (!li || !input) { missing.push(id); continue; }
    if (input.value === "0") li.querySelector(".checkbox")?.click();
    await new Promise((r) => setTimeout(r, 250));
    if (input.value !== "0") ticked.push(li.querySelector(".offer-name")?.textContent.trim() || id);
    else missing.push(id);
  }
  await chrome.storage.local.remove("c51Prefill");

  const note = document.createElement("div");
  note.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:300px;background:#1d2430;color:#eef2f6;" +
    "border-radius:12px;padding:14px 16px;font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35)";
  const title = document.createElement("div");
  title.style.cssText = "font-weight:600;margin-bottom:6px";
  title.textContent = `CouponSweep · ${p.label}`;
  const body = document.createElement("div");
  body.textContent = (ticked.length
    ? `Ticked ${ticked.length} offer${ticked.length === 1 ? "" : "s"}: ${ticked.join("; ")}. `
    : p.ids.length ? "None of the matched offers are on this week's list any more. " : "") +
    (attached ? "Attached the store's receipt picture (with its barcode). Check it, then submit."
      : "Add a photo of the receipt (or the saved receipt picture), then submit.");
  if (missing.length && ticked.length) body.textContent += ` (${missing.length} more weren't on the page.)`;
  const close = document.createElement("button");
  close.textContent = "Close";
  close.style.cssText = "margin-top:10px;background:#475569;color:#fff;border:0;border-radius:6px;padding:5px 12px;cursor:pointer;font:inherit";
  close.onclick = () => note.remove();
  note.append(title, body, close);
  document.body.append(note);
})();
