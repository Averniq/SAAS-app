import { validatePrinter } from "./ticket-model.js";
import { derivePrinterStatus } from "./printer-status.js";
import { FOREGROUND_NOTICE, TRANSMITTED_LABEL } from "./contracts.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const manager = (role) => ["owner", "manager"].includes(role);
export function renderPrinterSettings(data, role) {
  const {
    printers = [],
    devices = [],
    categories = [],
    pairings = [],
    control = {},
  } = data;
  return (
    "<header><h2>Kitchen Printers</h2><p>" +
    FOREGROUND_NOTICE +
    "</p><p>Pair tablet → enter LAN IP → select printer → Test Print → check paper → enable auto print.</p></header>" +
    '<p class="kp-message" role="status" aria-live="polite"></p><p class="muted">TCP transmission does not confirm paper output. Manual IP entry is supported; discovery is not available in P0.</p>' +
    '<div class="kp-pairing"><button type="button" data-kp="pair">Pair this Android tablet</button><label>Pairing request ID <input id="kp-pairing-id" autocomplete="off"></label><button type="button" data-kp="activate">Activate approved pairing</button><p id="kp-native-status" role="status"></p></div>' +
    (manager(role)
      ? '<form id="kp-printer-form" class="kp-form"><h3>Add / Edit Printer</h3><input name="id" type="hidden"><input name="revision" type="hidden"><label>Printer Name<input name="name" required maxlength="80"></label><label>IP Address (optional until installation)<input name="ip" inputmode="decimal" placeholder="192.168.1.20"></label><label>Port<input name="port" type="number" min="1024" max="65535" value="9100" required></label><label>Printer Type<input value="ESC/POS LAN" disabled></label><label>Destination<select name="destination"><option>Kitchen</option><option>Bar</option><option>Dessert</option></select></label><label>Print Copies<select name="copies"><option>1</option><option>2</option><option>3</option></select></label><label><input name="auto_cut" type="checkbox" checked>Auto Cut</label><label><input name="auto_print" type="checkbox">Enable Auto Print for this printer</label><label><input name="enabled" type="checkbox" checked>Printer enabled</label><button type="submit">Save Printer</button><button type="button" data-kp="reset">New Printer</button></form>' +
        '<fieldset class="kp-controls"><legend>Restaurant printing</legend><label><input id="kp-auto-enabled" type="checkbox" ' +
        (control.enabled ? "checked" : "") +
        '>Enable Auto Print</label><label><input id="kp-test-orders" type="checkbox" ' +
        (control.allow_test_orders ? "checked" : "") +
        '>Allow synthetic/test orders to auto print (testing only)</label><button type="button" data-kp="control">Save printing control</button></fieldset>' +
        "<section><h3>Print by Category</h3><p>Assign menu categories to Kitchen, Bar or Dessert. Unmapped items go to Kitchen.</p>" +
        categories
          .map(
            (c) =>
              "<label>" +
              escape(c.name) +
              '<select data-kp-category="' +
              escape(c.id) +
              '">' +
              ["Kitchen", "Bar", "Dessert"]
                .map(
                  (d) =>
                    "<option " +
                    (d === c.destination ? "selected" : "") +
                    ">" +
                    d +
                    "</option>",
                )
                .join("") +
              "</select></label>",
          )
          .join("") +
        '<button type="button" data-kp="routes">Save category routing</button></section>'
      : "") +
    '<section class="kp-printers"><h3>Printers</h3>' +
    (printers.length
      ? printers
          .map(
            (p) =>
              "<article><h4>" +
              escape(p.name) +
              "</h4><strong>" +
              derivePrinterStatus({ printer: p, devices }) +
              "</strong><p>" +
              escape(p.ip || "IP not entered") +
              " · " +
              escape(p.destination) +
              " · " +
              escape(p.copies) +
              ' copies</p><button type="button" data-kp="test" data-id="' +
              escape(p.id) +
              '">Test Print</button>' +
              (manager(role)
                ? '<button type="button" data-kp="edit" data-id="' +
                  escape(p.id) +
                  '">Edit</button><button type="button" data-kp="disable" data-id="' +
                  escape(p.id) +
                  '">Disable Printer</button>'
                : "") +
              "</article>",
          )
          .join("")
      : "<p>Not Configured — add a printer to get started.</p>") +
    "</section>" +
    (manager(role)
      ? "<section><h3>Pending pairing requests</h3>" +
        pairings
          .map(
            (p) =>
              "<article><p>" +
              escape(p.name) +
              " · Request " +
              escape(p.id) +
              '</p><label>Assign printers<select multiple data-kp-assign="' +
              escape(p.id) +
              '">' +
              printers
                .filter((x) => x.enabled)
                .map(
                  (x) =>
                    '<option value="' +
                    escape(x.id) +
                    '">' +
                    escape(x.name) +
                    "</option>",
                )
                .join("") +
              '</select></label><button data-kp="approve" data-id="' +
              escape(p.id) +
              '">Approve pairing</button></article>',
          )
          .join("") +
        "<h3>Registered devices</h3>" +
        devices
          .map(
            (d) =>
              "<p>" +
              escape(d.name) +
              " · " +
              (d.revoked_at ? "Revoked" : "Registered") +
              ' <button data-kp="revoke" data-id="' +
              escape(d.id) +
              '">Revoke device</button></p>',
          )
          .join("") +
        "</section>"
      : "") +
    '<section><h3>Print History</h3><div id="kp-history"></div><button data-kp="refresh-history">Refresh History</button><button data-kp="history">Load more history</button></section>'
  );
}
export function mountKitchenPrinters({ root, cloud, nativeAgent, staff }) {
  let data = null,
    disposed = false,
    busy = false,
    dirty = false,
    formDirty = false,
    pairingId = "",
    cursor = null,
    history = [],
    timer;
  root.classList.add("kp-panel");
  const setMessage = (message, error = false) => {
    const e = root.querySelector(".kp-message");
    if (e) {
      e.textContent = message;
      e.setAttribute("role", error ? "alert" : "status");
    }
  };
  async function rpc(name, body) {
    const session = await cloud.getSession();
    if (!session) throw Error("Staff sign-in required.");
    return cloud.request("rpc/" + name, {
      method: "POST",
      accessToken: session.access_token,
      body: JSON.stringify(body),
    });
  }
  async function refresh() {
    if (disposed || busy) return;
    try {
      data = await rpc("list_kitchen_printers", {
        p_restaurant_id: staff.restaurantId,
      });
      if (disposed) return;
      const focused =
        root.contains(document.activeElement) &&
        document.activeElement.matches("input,select");
      if (!focused && !dirty) {
        pairingId = root.querySelector("#kp-pairing-id")?.value || pairingId;
        root.innerHTML = renderPrinterSettings(data, staff.role);
        root.querySelector("#kp-pairing-id").value = pairingId;
        renderHistory();
      }
    } catch (e) {
      if (!disposed) {
        if (!root.querySelector(".kp-message"))
          root.innerHTML =
            '<h2>Kitchen Printers</h2><p class="kp-message" role="alert"></p>';
        setMessage(e.message, true);
      }
    }
  }
  function renderHistory() {
    const target = root.querySelector("#kp-history");
    if (target)
      target.innerHTML = history
        .map(
          (j) =>
            "<article><p>" +
            escape(j.order_number || "Test") +
            " · " +
            escape(j.kind) +
            " · " +
            escape(j.state === "transmitted" ? TRANSMITTED_LABEL : j.state) +
            " " +
            escape(j.error_code || "") +
            '</p><button data-kp="reprint" data-id="' +
            escape(j.id) +
            '">Manual Reprint</button>' +
            (["uncertain", "failed"].includes(j.state)
              ? '<button data-kp="resolve" data-id="' +
                escape(j.id) +
                '">Resolve attention</button>'
              : "") +
            "</article>",
        )
        .join("");
  }
  async function action(event) {
    const button = event.target.closest("[data-kp]");
    if (!button || busy) return;
    const what = button.dataset.kp,
      id = button.dataset.id;
    const requestIdentity =
      "aveniq-print-request:" +
      staff.restaurantId +
      ":" +
      staff.id +
      ":" +
      what +
      ":" +
      id;
    const requestKey = () => {
      let value = sessionStorage.getItem(requestIdentity);
      if (!value) {
        value = crypto.randomUUID();
        sessionStorage.setItem(requestIdentity, value);
      }
      return value;
    };
    if (what === "edit") {
      dirty = true;
      formDirty = true;
      const p = data.printers.find((x) => x.id === id);
      const form = root.querySelector("form");
      for (const [k, v] of Object.entries(p)) {
        const e = form.elements.namedItem(k);
        if (e) {
          if (e.type === "checkbox") e.checked = Boolean(v);
          else e.value = v ?? "";
        }
      }
      form.scrollIntoView({ block: "nearest" });
      return;
    }
    if (what === "reset") {
      dirty = false;
      formDirty = false;
      root.querySelector("form")?.reset();
      root.querySelector("form input[name=id]").value = "";
      root.querySelector("form input[name=revision]").value = "";
      return;
    }
    busy = true;
    button.disabled = true;
    try {
      let result;
      if (what === "pair") {
        if (!nativeAgent)
          throw Error("Open the Android Kitchen App to pair a tablet.");
        const name = prompt("Tablet name", "Kitchen tablet");
        if (!name) return;
        result = await nativeAgent.beginPairing({
          restaurantId: staff.restaurantId,
          deviceName: name,
        });
        pairingId = result.id;
        root.querySelector("#kp-pairing-id").value = pairingId;
        setMessage("Ask an Owner or Manager to approve request " + result.id);
        return;
      }
      if (what === "activate") {
        if (!nativeAgent)
          throw Error("Open the Android Kitchen App to activate pairing.");
        await nativeAgent.activatePairing({
          pairingId: root.querySelector("#kp-pairing-id").value.trim(),
        });
        await nativeAgent.start();
      }
      if (what === "approve") {
        const select = root.querySelector('[data-kp-assign="' + id + '"]');
        await rpc("approve_kitchen_print_pairing", {
          p_pairing_id: id,
          p_printer_ids: [...select.selectedOptions].map((o) => o.value),
        });
      }
      if (what === "revoke" || what === "disable") {
        if (
          !confirm(
            what === "revoke"
              ? "Revoke this device? It will stop receiving new print work."
              : "Disable this printer? Its print history will be retained.",
          )
        )
          return;
        const reason = prompt("Reason");
        if (!reason) return;
        await rpc(
          what === "revoke"
            ? "revoke_kitchen_print_device"
            : "disable_kitchen_printer",
          {
            [what === "revoke" ? "p_device_id" : "p_printer_id"]: id,
            p_reason: reason,
          },
        );
      }
      if (what === "test") {
        if (
          !confirm(
            "Print an explicit synthetic test ticket? Check the paper before enabling auto print.",
          )
        )
          return;
        await rpc("request_kitchen_test_print", {
          p_printer_id: id,
          p_request_key: requestKey(),
        });
      }
      if (what === "routes") {
        const p = data.printers[0];
        if (!p) throw Error("Add a printer before saving category routing.");
        await rpc("save_kitchen_printer", {
          p_restaurant_id: staff.restaurantId,
          p_printer_id: p.id,
          p_config: {
            ...p,
            categoryRoutes: [
              ...root.querySelectorAll("[data-kp-category]"),
            ].map((s) => ({
              categoryId: s.dataset.kpCategory,
              destination: s.value,
            })),
          },
        });
        dirty = formDirty;
      }
      if (what === "control")
        await rpc("set_kitchen_print_control", {
          p_restaurant_id: staff.restaurantId,
          p_enabled: root.querySelector("#kp-auto-enabled").checked,
          p_allow_test_orders: root.querySelector("#kp-test-orders").checked,
        });
      if (what === "reprint") {
        if (
          !confirm(
            "This may print a duplicate ticket. Check existing paper and stop any old agent first. Continue?",
          )
        )
          return;
        const reason = prompt("Reason for reprint");
        if (!reason) return;
        await rpc("request_kitchen_reprint", {
          p_job_id: id,
          p_reason: reason,
          p_request_key: requestKey(),
        });
      }
      if (what === "resolve") {
        if (
          !confirm(
            "Have you checked paper output and stopped/disconnected any old agent? Resolving releases the printer for later work.",
          )
        )
          return;
        const reason = prompt("What did you check?");
        if (!reason) return;
        await rpc("resolve_kitchen_print_uncertainty", {
          p_job_id: id,
          p_resolution: "paper_checked",
          p_reason: reason,
        });
      }
      if (what === "history" || what === "refresh-history") {
        if (what === "refresh-history") {
          history = [];
          cursor = null;
        }
        const rows = await rpc("list_kitchen_print_history", {
          p_restaurant_id: staff.restaurantId,
          p_before: cursor?.created_at || null,
          p_before_id: cursor?.id || null,
          p_limit: 50,
        });
        history.push(...rows);
        cursor = rows.at(-1) || cursor;
        renderHistory();
        setMessage(rows.length ? "History loaded." : "No more print jobs.");
        return;
      }
      if (what === "control") dirty = formDirty;
      sessionStorage.removeItem(requestIdentity);
      setMessage("Printing action recorded. Check status and paper output.");
    } catch (e) {
      setMessage(e.message, true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }
  async function save(event) {
    if (event.target.getAttribute("id") !== "kp-printer-form") return;
    event.preventDefault();
    if (busy) return;
    const form = event.target;
    busy = true;
    const submit = form.querySelector("[type=submit]");
    submit.disabled = true;
    try {
      const raw = Object.fromEntries(new FormData(form));
      const config = validatePrinter({
        ...raw,
        auto_print: form.elements.auto_print.checked,
        auto_cut: form.elements.auto_cut.checked,
        enabled: form.elements.enabled.checked,
      });
      if (!raw.revision) delete config.revision;
      config.categoryRoutes = [
        ...root.querySelectorAll("[data-kp-category]"),
      ].map((s) => ({
        categoryId: s.dataset.kpCategory,
        destination: s.value,
      }));
      await rpc("save_kitchen_printer", {
        p_restaurant_id: staff.restaurantId,
        p_printer_id: raw.id || null,
        p_config: config,
      });
      dirty = false;
      formDirty = false;
      setMessage(
        "Printer saved. Test paper output before enabling auto print.",
      );
      form.reset();
      form.elements.id.value = "";
      form.elements.revision.value = "";
    } catch (e) {
      setMessage(e.message, true);
    } finally {
      busy = false;
      submit.disabled = false;
    }
  }
  const markDirty = (event) => {
    if (
      event.target.matches("input,select") &&
      event.target.getAttribute("id") !== "kp-pairing-id"
    ) {
      dirty = true;
      if (event.target.closest("#kp-printer-form")) formDirty = true;
    }
  };
  root.addEventListener("input", markDirty);
  root.addEventListener("change", markDirty);
  root.addEventListener("click", action);
  root.addEventListener("submit", save);
  root.innerHTML =
    '<h2>Kitchen Printers</h2><p role="status">Loading printer settings…</p>';
  refresh();
  timer = setInterval(() => {
    if (
      !document.hidden &&
      !root.closest(".admin-panel-inactive") &&
      root.offsetParent !== null
    )
      refresh();
  }, 20000);
  return () => {
    disposed = true;
    clearInterval(timer);
    root.removeEventListener("input", markDirty);
    root.removeEventListener("change", markDirty);
    root.removeEventListener("click", action);
    root.removeEventListener("submit", save);
    root.replaceChildren();
  };
}
