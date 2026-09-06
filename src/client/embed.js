/* Script analyser client.
   Served by the Webflow Cloud app at <mount>/embed.js and loaded by the /script page, which is
   built in the Webflow Designer. The page owns every visible element and every word of copy; this
   file finds the elements by id, posts the form to the app, reads the SSE stream and renders the
   analysis as it arrives. The ids the page must provide are listed in
   docs/designer-page-build-sheet.md and tests/embed.test.ts keeps the two in step. */
(function () {
  "use strict";

  /* Where the app lives: the folder this file was loaded from, so the same file works on
     1stdecember.com and on the webflow.io staging domain. data-base on the script tag overrides. */
  var script = document.currentScript;
  var base = (script && script.getAttribute("data-base")) || "";
  if (!base && script && script.src) {
    base = script.src.replace(/[?#].*$/, "").replace(/^https?:\/\/[^/]+/, "").replace(/\/embed\.js$/, "");
  }
  if (!base) base = "/analyser";
  base = base.replace(/\/$/, "");

  var ID = {
    form: "fdf-form", text: "fdf-text", email: "fdf-email", company: "fdf-company", website: "fdf-website",
    consent: "fdf-consent", submit: "fdf-submit", error: "fdf-error",
    intro: "fdf-intro", analysis: "fdf-analysis", barText: "fdf-bar-text", restart: "fdf-restart",
    dot: "fdf-dot", statusText: "fdf-status-text", output: "fdf-output",
    cta: "fdf-cta", ctaContact: "fdf-cta-contact", ctaLink: "fdf-cta-link", reference: "fdf-reference"
  };
  var OPTIONAL = { company: true, website: true };
  var el = {};
  var missing = [];
  Object.keys(ID).forEach(function (k) {
    el[k] = document.getElementById(ID[k]);
  });
  /* Webflow names its form element wf-form-<name>; the form is whatever encloses the textarea. */
  if (!el.form && el.text && el.text.closest) el.form = el.text.closest("form");
  Object.keys(ID).forEach(function (k) {
    if (!el[k] && !OPTIONAL[k]) missing.push("#" + ID[k]);
  });
  if (missing.length) {
    if (window.console) console.warn("Script analyser: the page is missing " + missing.join(", ") + ". Nothing will run until they exist.");
    return;
  }

  function hide(e) { if (e) e.classList.add("fdf-hidden"); }
  function show(e) { if (e) e.classList.remove("fdf-hidden"); }
  function showError(msg) { el.error.textContent = msg; show(el.error); }
  function clearError() { el.error.textContent = ""; hide(el.error); }
  function setStatus(t, done) { el.statusText.textContent = t; if (done) el.dot.classList.add("is-done"); }
  function toTop(smooth) {
    if (window.lenis && typeof window.lenis.scrollTo === "function") {
      try { window.lenis.scrollTo(0, { immediate: !smooth }); return; } catch (e) {}
    }
    window.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
  }

  /* The submit control may be a Webflow submit input, a button or a link. */
  var isInput = el.submit.tagName === "INPUT";
  var idleLabel = isInput ? el.submit.value : el.submit.textContent;
  var busyLabel = el.submit.getAttribute("data-wait") || "Reading";
  function setLabel(t) { if (isInput) el.submit.value = t; else el.submit.textContent = t; }
  function setBusy(on) {
    setLabel(on ? busyLabel : idleLabel);
    if ("disabled" in el.submit) el.submit.disabled = on;
    el.submit.setAttribute("aria-disabled", on ? "true" : "false");
    el.submit.classList.toggle("is-busy", on);
  }

  /* Copy the page can override with custom attributes on #fdf-bar-text. */
  var BAR_BUSY = el.barText.getAttribute("data-busy") || "Analysing your script. This takes about a minute, and the text appears here as it is written.";
  var BAR_DONE = el.barText.getAttribute("data-done") || "Your analysis. Read it here, keep the link, or talk to a producer about it.";
  var BAR_NONE = el.barText.getAttribute("data-none") || "That did not read as a script or a brief. Start over and paste the script itself, or a one page brief.";
  var SECTION_STATUS = {
    "The read": "Reading the script", "Beat sheet": "Laying out the beats", "Runtime and format": "Estimating runtime",
    "Production breakdown": "Breaking down the production", "Three comparable films": "Finding comparable films",
    "Two directors": "Thinking about directors", "What we would push on": "Writing the notes", "The questions we would ask": "Writing the questions"
  };

  /* The site's head script fills hidden inputs into any form marked data-lead-form. Read them back so
     a script submission carries the same fourteen fields as a contact form submission. */
  function attribution() {
    var out = {};
    var inputs = el.form.querySelectorAll('input[type="hidden"][name]');
    for (var i = 0; i < inputs.length; i++) {
      var n = inputs[i].name;
      if (/^(Lead|First|Last|UTM|Click|Referrer|Landing|Submitted|Visit|Device)/.test(n)) out[n.replace(/-/g, " ")] = inputs[i].value;
    }
    if (!Object.keys(out).length) {
      var w = window.innerWidth;
      out = {
        "Submitted From": location.pathname,
        "Landing Page": location.pathname + location.search,
        "Referrer": document.referrer || "",
        "Device": (w < 768 ? "mobile" : w < 1024 ? "tablet" : "desktop") + " " + w + "x" + window.innerHeight
      };
    }
    return out;
  }

  /* Setup. The three blocks start hidden even if the Designer forgot the class; the textarea keeps
     its own scroll under Lenis. */
  hide(el.analysis); hide(el.cta); hide(el.error);
  el.text.setAttribute("data-lenis-prevent", "");
  if (!el.form.hasAttribute("data-lead-form")) el.form.setAttribute("data-lead-form", "");

  el.restart.addEventListener("click", function (e) {
    e.preventDefault();
    hide(el.analysis);
    show(el.intro);
    el.output.innerHTML = "";
    hide(el.cta);
    setBusy(false);
    clearError();
    toTop(true);
    el.text.focus();
  });

  /* Capture phase plus stopImmediatePropagation so Webflow's own form handler never sees the submit. */
  el.form.addEventListener("submit", function (e) { e.preventDefault(); e.stopImmediatePropagation(); run(); }, true);
  el.submit.addEventListener("click", function (e) {
    if (el.submit.tagName === "A" || el.submit.type === "button") { e.preventDefault(); run(); }
  });
  el.form.setAttribute("novalidate", "");

  var running = false;
  async function run() {
    if (running) return;
    clearError();
    var text = el.text.value.trim(), email = el.email.value.trim();
    if (text.split(/\s+/).filter(Boolean).length < 40) return showError("Paste the whole script or brief. This needs at least a few paragraphs to work with.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showError("Enter a working email address.");
    if (!el.consent.checked) return showError("Please confirm you have read how your script is handled.");
    running = true;
    setBusy(true);
    el.output.innerHTML = "";
    hide(el.cta);
    el.dot.classList.remove("is-done");
    el.barText.textContent = BAR_BUSY;
    hide(el.intro);
    show(el.analysis);
    setStatus("Reading the script");
    toTop(false);
    var html = "", kind = null;
    try {
      var res = await fetch(base + "/api/analyse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email,
          company: el.company ? el.company.value.trim() : "",
          text: text,
          website: el.website ? el.website.value : "",
          attribution: attribution()
        })
      });
      if (!res.ok) {
        var err = {};
        try { err = await res.json(); } catch (x) {}
        hide(el.analysis);
        show(el.intro);
        showError(err.message || "Something went wrong. Try again in a minute.");
        el.error.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = "";
      el.output.classList.add("fdf-cursor");
      for (;;) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var i;
        while ((i = buf.indexOf("\n\n")) !== -1) {
          var frame = buf.slice(0, i); buf = buf.slice(i + 2);
          var ev = (frame.match(/^event: (.*)$/m) || [])[1], data = (frame.match(/^data: (.*)$/m) || [])[1];
          if (!ev || !data) continue;
          var d; try { d = JSON.parse(data); } catch (x) { continue; }
          if (ev === "kind") {
            kind = d.kind;
            if (kind === "none") { setStatus("This does not look like a script"); el.barText.textContent = BAR_NONE; }
          } else if (ev === "section") {
            setStatus(SECTION_STATUS[d.key] || d.key);
          } else if (ev === "delta") {
            html += d.html; el.output.innerHTML = html;
          } else if (ev === "done") {
            el.output.classList.remove("fdf-cursor");
            setStatus(d.kind === "none" ? "Nothing to analyse" : "Done", true);
            if (d.kind !== "none") {
              el.barText.textContent = BAR_DONE;
              show(el.cta);
              el.ctaContact.href = location.origin + "/contact?ref=" + encodeURIComponent(d.id);
              el.ctaLink.href = base + "/r/" + d.id;
              el.reference.textContent = "Reference " + d.id.slice(0, 8) + ". Quote it when you write to us.";
            }
          } else if (ev === "error") {
            el.output.classList.remove("fdf-cursor");
            setStatus("Stopped", true);
            el.barText.textContent = d.message || "Something went wrong. Try again in a minute.";
          }
        }
      }
      el.output.classList.remove("fdf-cursor");
    } catch (err) {
      el.output.classList.remove("fdf-cursor");
      setStatus("Connection lost", true);
      el.barText.textContent = "The connection dropped before the analysis finished. Start over to try again.";
    } finally {
      running = false;
      setBusy(false);
    }
  }
})();
