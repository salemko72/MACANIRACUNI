import { useEffect, useRef, useState } from "react";
import {
  ensureMonth,
  seed,
  synchronizeMonths,
  updateBill,
  type Bill,
} from "../domain";
import { validateBills } from "../backup";
import { mergeBillChanges } from "./merge";
export type RecordVersion = { bill: Bill; revision: number };
type Pending = {
  bill: Bill;
  revision: number;
  base: Bill;
  operationIds?: string[];
  ancestors?: string[];
};
type Operation = Pending & {
  token: string;
  actor: string;
  ancestors: string[];
  supersedes: string[];
};
type SiblingConflict = {
  primary: Pending;
  alternative: Operation;
  pairIds: string[];
};
type Cache = {
  email: string;
  bills: Bill[];
  versions: Record<string, RecordVersion>;
  pending: Record<string, Pending>;
  conflicts: Record<string, RecordVersion>;
};
const LOCAL = "macaniracuni-demo-v1",
  FAMILY = "macaniracuni-family-v1";
const OUTBOX = "macaniracuni-family-outbox-v1",
  OPERATION = OUTBOX + ":";
const tokenPattern = /^[a-f0-9-]{36}$/;
function operationKeys() {
  return Object.keys(localStorage).filter((key) => key.startsWith(OPERATION));
}
function readOperations(): Operation[] {
  const entries: Operation[] = [];
  for (const key of operationKeys()) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const value = JSON.parse(raw);
    if (
      !object(value) ||
      typeof value.token !== "string" ||
      !tokenPattern.test(value.token) ||
      key !== OPERATION + value.token ||
      typeof value.actor !== "string" ||
      !Number.isSafeInteger(value.revision) ||
      (value.revision as number) < 0 ||
      !Array.isArray(value.ancestors) ||
      !Array.isArray(value.supersedes) ||
      [...value.ancestors, ...value.supersedes].some(
        (id) => typeof id !== "string" || !tokenPattern.test(id),
      )
    )
      throw new Error("invalid_outbox");
    const bill = validBill(value.bill),
      base = validBill(value.base);
    if (!sameIdentity(bill, base)) throw new Error("invalid_outbox");
    entries.push({
      bill,
      base,
      revision: value.revision as number,
      token: value.token,
      actor: value.actor,
      ancestors: value.ancestors,
      supersedes: value.supersedes,
    });
  }
  const replaced = new Set(entries.flatMap((entry) => entry.supersedes));
  return entries
    .filter((entry) => !replaced.has(entry.token))
    .sort((a, b) => a.token.localeCompare(b.token));
}
function removeOperations(ids: string[]) {
  for (const id of ids) localStorage.removeItem(OPERATION + id);
}
function persistOperation(
  item: Pending,
  actor: string,
  supersedes: string[],
  migrating = false,
): Operation {
  const operation: Operation = {
    bill: item.bill,
    base: item.base,
    revision: item.revision,
    actor,
    token: crypto.randomUUID(),
    supersedes,
    ancestors: [...new Set([...(item.ancestors ?? []), ...supersedes])],
  };
  try {
    const acceptsWrites = () =>
      localStorage.getItem(OUTBOX) === "1" ||
      (migrating && localStorage.getItem(OUTBOX) === null);
    if (!acceptsWrites()) throw new Error("session_closed");
    // Append first. Acknowledgements and replacements delete exact immutable keys only.
    localStorage.setItem(
      OPERATION + operation.token,
      JSON.stringify(operation),
    );
    if (!acceptsWrites()) {
      localStorage.removeItem(OPERATION + operation.token);
      throw new Error("session_closed");
    }
    removeOperations(supersedes);
  } catch {
    throw new Error("storage_unavailable");
  }
  return operation;
}
function initializeOutbox(c: Cache, actor: string) {
  if (localStorage.getItem(OUTBOX)) return;
  for (const pending of Object.values(c.pending))
    persistOperation(pending, actor, [], true);
  localStorage.setItem(OUTBOX, "1");
}
const safeId = (id: unknown): id is string =>
  typeof id === "string" &&
  /^[A-Za-z0-9_-]{1,128}$/.test(id) &&
  !["__proto__", "constructor", "prototype"].includes(id);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const sameIdentity = (a: Bill, b: Bill) =>
  a.id === b.id &&
  a.templateId === b.templateId &&
  a.billingMonth === b.billingMonth;
const billFields = new Set([
  "id",
  "templateId",
  "billingMonth",
  "currency",
  "receiptStatus",
  "paymentStatus",
  "amount",
  "dueDate",
  "issueDate",
  "receivedAt",
  "paidAt",
  "previousBalance",
  "balanceType",
  "source",
  "notes",
  "documentId",
  "confidence",
  "isDemo",
]);
function validBill(value: unknown): Bill {
  const [bill] = validateBills([value]);
  if (
    !safeId(bill.id) ||
    bill.isDemo === true ||
    Object.keys(bill).some((key) => !billFields.has(key)) ||
    (bill.notes?.length ?? 0) > 8000
  )
    throw new Error("invalid_family_bill");
  for (const field of [
    "receiptStatus",
    "paymentStatus",
    "source",
    "balanceType",
  ] as const) {
    if (bill[field] !== undefined && typeof bill[field] !== "string")
      throw new Error("invalid_family_bill");
  }
  return bill;
}
function validRecord(value: unknown): RecordVersion {
  if (
    !object(value) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 ||
    (value.revision as number) >= Number.MAX_SAFE_INTEGER
  )
    throw new Error("invalid_revision");
  return { bill: validBill(value.bill), revision: value.revision as number };
}
export function parseFamilyCache(raw: string | null): Cache | null {
  try {
    if (!raw || raw.length > 5_000_000) return null;
    const value: unknown = JSON.parse(raw);
    if (
      !object(value) ||
      typeof value.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) ||
      !object(value.versions) ||
      !object(value.pending) ||
      !object(value.conflicts)
    )
      return null;
    const bills = validateBills(value.bills).map(validBill);
    const versions: Record<string, RecordVersion> = Object.create(null);
    const pending: Record<string, Pending> = Object.create(null);
    const conflicts: Record<string, RecordVersion> = Object.create(null);
    for (const [id, entry] of Object.entries(value.versions)) {
      const rec = validRecord(entry);
      if (!safeId(id) || rec.bill.id !== id) return null;
      versions[id] = rec;
    }
    for (const [id, entry] of Object.entries(value.pending)) {
      if (
        !safeId(id) ||
        !object(entry) ||
        !Number.isSafeInteger(entry.revision) ||
        (entry.revision as number) < 0 ||
        (entry.revision as number) >= Number.MAX_SAFE_INTEGER
      )
        return null;
      const bill = validBill(entry.bill),
        base = validBill(entry.base);
      if (
        bill.id !== id ||
        !sameIdentity(bill, base) ||
        !bills.some(
          (b) => b.id === id && JSON.stringify(b) === JSON.stringify(bill),
        )
      )
        return null;
      pending[id] = { bill, base, revision: entry.revision as number };
    }
    for (const [id, entry] of Object.entries(value.conflicts)) {
      const rec = validRecord(entry);
      // A unique provider/month conflict may legitimately use another record ID.
      if (
        !safeId(id) ||
        !pending[id] ||
        pending[id].bill.templateId !== rec.bill.templateId ||
        pending[id].bill.billingMonth !== rec.bill.billingMonth
      )
        return null;
      conflicts[id] = rec;
    }
    return { email: value.email, bills, versions, pending, conflicts };
  } catch {
    return null;
  }
}
const readCache = () => {
  try {
    return parseFamilyCache(localStorage.getItem(FAMILY));
  } catch {
    return null;
  }
};
const readLocal = () => {
  try {
    return synchronizeMonths(
      validateBills(JSON.parse(localStorage.getItem(LOCAL) || "null")),
    );
  } catch {
    return seed();
  }
};
const emptyCache = (email: string): Cache => ({
  email,
  bills: [],
  versions: Object.create(null),
  pending: Object.create(null),
  conflicts: Object.create(null),
});
class RequestError extends Error {}
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    credentials: "same-origin",
    redirect: "manual",
    cache: "no-store",
    ...init,
  });
  if (
    response.type === "opaqueredirect" ||
    response.status === 401 ||
    response.status === 403
  )
    throw new RequestError("login_required");
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new RequestError("login_required");
  return { response, body: await response.json() };
}

export function useLedger(month: string) {
  const [bills, setBillState] = useState<Bill[]>(readLocal);
  const [mode, setMode] = useState<"local" | "family">("local");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("checking");
  const [error, setError] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [conflicts, setConflicts] = useState<Record<string, RecordVersion>>({});
  const cache = useRef<Cache | null>(null),
    active = useRef(false),
    generation = useRef(0);
  const actor = useRef(crypto.randomUUID());
  const siblingConflicts = useRef<Record<string, SiblingConflict>>(
    Object.create(null),
  );
  const busy = useRef<{
    generation: number;
    controller: AbortController;
    rerun: boolean;
  } | null>(null);
  const currentBills = useRef(bills),
    currentMonth = useRef(month);
  currentBills.current = bills;
  currentMonth.current = month;
  function commit(next: Bill[], nextCache?: Cache) {
    try {
      localStorage.setItem(
        nextCache ? FAMILY : LOCAL,
        JSON.stringify(nextCache ?? next),
      );
    } catch {
      throw new Error("storage_unavailable");
    }
    if (nextCache) {
      cache.current = nextCache;
      setPendingCount(Object.keys(nextCache.pending).length);
      setConflicts({ ...nextCache.conflicts });
    }
    currentBills.current = next;
    setBillState(next);
  }
  function applyOutbox(c: Cache) {
    const previous = new Set(Object.keys(c.pending));
    const grouped = new Map<string, Operation[]>();
    for (const op of readOperations())
      grouped.set(op.bill.id, [...(grouped.get(op.bill.id) ?? []), op]);
    const pending: Record<string, Pending> = Object.create(null);
    const siblings: Record<string, SiblingConflict> = Object.create(null);
    for (const [id, operations] of grouped) {
      // Prefer this tab's version in the explicit "my change" choice.
      operations.sort(
        (a, b) =>
          Number(b.actor === actor.current) -
            Number(a.actor === actor.current) || a.token.localeCompare(b.token),
      );
      const first = operations[0];
      let item: Pending = {
        bill: first.bill,
        base: first.base,
        revision: first.revision,
        operationIds: [first.token],
        ancestors: first.ancestors,
      };
      for (const other of operations.slice(1)) {
        const merged = mergeBillChanges(other.base, other.bill, item.bill);
        if (!merged) {
          siblings[id] = {
            primary: item,
            alternative: other,
            pairIds: [...item.operationIds!, other.token],
          };
          break;
        }
        item = {
          ...item,
          bill: merged,
          operationIds: [...item.operationIds!, other.token],
          ancestors: [
            ...new Set([...(item.ancestors ?? []), ...other.ancestors]),
          ],
        };
      }
      pending[id] = item;
      if (siblings[id])
        c.conflicts[id] = {
          bill: siblings[id].alternative.bill,
          revision: Math.max(1, siblings[id].alternative.revision),
        };
      else if (siblingConflicts.current[id]) delete c.conflicts[id];
    }
    for (const id of Object.keys(c.conflicts))
      if (!pending[id]) delete c.conflicts[id];
    for (const id of Object.keys(pending)) previous.add(id);
    c.bills = c.bills.filter((bill) => !previous.has(bill.id));
    for (const id of previous) {
      const bill = pending[id]?.bill ?? c.versions[id]?.bill;
      if (bill) c.bills.push(bill);
    }
    c.pending = pending;
    siblingConflicts.current = siblings;
  }
  function refreshView(c: Cache) {
    applyOutbox(c);
    commit(ensureMonth(synchronizeMonths(c.bills), currentMonth.current), c);
  }
  function showError(err: unknown) {
    if (err instanceof Error && err.message === "login_required") {
      setStatus("login_required");
      setError("Prijavite se ponovo da pošaljete sačuvane izmjene.");
    } else {
      setStatus("offline");
      setError(
        err instanceof Error && err.message === "storage_unavailable"
          ? "Preglednik ne dopušta lokalno čuvanje. Preuzmite sigurnosnu kopiju."
          : "Izmjene su sačuvane na uređaju. Sinhronizacija će se ponoviti kada veza bude dostupna.",
      );
    }
  }
  async function sync() {
    if (!active.current || !cache.current) return;
    if (busy.current) {
      busy.current.rerun = true;
      return;
    }
    const c = cache.current;
    const run = {
      generation: generation.current,
      controller: new AbortController(),
      rerun: false,
    };
    busy.current = run;
    const current = () =>
      active.current &&
      generation.current === run.generation &&
      cache.current === c;
    let succeeded = false;
    try {
      setStatus("syncing");
      setError("");
      const remote = await request("/api/bills", {
        signal: run.controller.signal,
      });
      if (!current()) return;
      if (!remote.response.ok || !Array.isArray(remote.body.bills))
        throw new Error("invalid_remote");
      const incoming = remote.body.bills.map(validRecord) as RecordVersion[];
      validateBills(incoming.map((rec) => rec.bill));
      applyOutbox(c);
      // A full GET is authoritative; keep only local queued changes in addition to it.
      c.bills = c.bills.filter((b) => !!c.pending[b.id]);
      c.versions = Object.create(null);
      for (const rec of incoming) {
        c.versions[rec.bill.id] = rec;
        if (!c.pending[rec.bill.id]) c.bills.push(rec.bill);
        if (c.conflicts[rec.bill.id]) c.conflicts[rec.bill.id] = rec;
      }
      refreshView(c);
      for (const id of Object.keys(c.pending)) {
        if (!current()) return;
        const item = c.pending[id];
        if (!item || c.conflicts[id]) continue;
        let send = { bill: item.bill, revision: item.revision };
        const put = () =>
          request("/api/bills/" + encodeURIComponent(id), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(send),
            signal: run.controller.signal,
          });
        let saved = await put();
        if (!current()) return;
        if (saved.response.status === 409) {
          if (!saved.body.current) throw new Error("missing_conflict_record");
          let rec = validRecord(saved.body.current);
          const merged = mergeBillChanges(item.base, item.bill, rec.bill);
          if (merged) {
            send = { bill: merged, revision: rec.revision };
            saved = await put();
            if (!current()) return;
            if (saved.response.status === 409)
              rec = validRecord(saved.body.current);
          }
          if (saved.response.status === 409) {
            if (c.pending[id]) c.conflicts[id] = rec;
            refreshView(c);
            continue;
          }
        }
        if (!saved.response.ok) throw new Error("write_failed");
        const rec = validRecord(saved.body);
        if (!sameIdentity(item.bill, rec.bill) || rec.revision <= send.revision)
          throw new Error("invalid_write_result");
        c.versions[id] = rec;
        const sentIds = item.operationIds ?? [];
        removeOperations(sentIds);
        for (const newer of readOperations()) {
          if (
            newer.bill.id !== id ||
            !newer.ancestors.some((token) => sentIds.includes(token))
          )
            continue;
          const rebased = mergeBillChanges(item.bill, newer.bill, rec.bill);
          if (rebased) {
            persistOperation(
              {
                bill: rebased,
                revision: rec.revision,
                base: rec.bill,
                ancestors: newer.ancestors,
              },
              newer.actor,
              [newer.token],
            );
          } else c.conflicts[id] = rec;
        }
        refreshView(c);
        if (Object.keys(c.pending).some((key) => !c.conflicts[key]))
          run.rerun = true;
      }
      if (!current()) return;
      setStatus(
        Object.keys(c.conflicts).length
          ? "conflict"
          : Object.keys(c.pending).length
            ? "pending"
            : "synced",
      );
      succeeded = true;
    } catch (err) {
      if (current()) showError(err);
    } finally {
      if (busy.current === run) busy.current = null;
      if (succeeded && current() && run.rerun) void sync();
    }
  }
  useEffect(() => {
    const sessionGeneration = ++generation.current;
    const controller = new AbortController();
    const current = () =>
      generation.current === sessionGeneration && !controller.signal.aborted;
    const activate = (c: Cache, who: string) => {
      initializeOutbox(c, actor.current);
      refreshView(c);
      active.current = true;
      setMode("family");
      setEmail(who);
    };
    (async () => {
      try {
        const session = await request("/api/session", {
          signal: controller.signal,
        });
        if (!current()) return;
        if (!session.response.ok) {
          setStatus("unavailable");
          return;
        }
        const who = session.body.email;
        if (typeof who !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(who))
          throw new RequestError("login_required");
        const saved = readCache();
        // Every approved identity accesses the same household; retain its offline queue.
        const c = saved ? { ...saved, email: who } : emptyCache(who);
        activate(c, who);
        await sync();
      } catch (err) {
        if (!current()) return;
        const saved = readCache();
        if (
          saved &&
          !(err instanceof RequestError && err.message === "login_required")
        ) {
          try {
            activate(saved, saved.email);
            showError(err);
          } catch (storageError) {
            showError(storageError);
          }
        } else if (
          err instanceof Error &&
          err.message === "storage_unavailable"
        ) {
          showError(err);
        } else
          setStatus(err instanceof RequestError ? "anonymous" : "unavailable");
      }
    })();
    const tick = () => {
      if (active.current) void sync();
    };
    const timer = setInterval(tick, 20000);
    const storage = (event: StorageEvent) => {
      if (!active.current || !cache.current) return;
      if (event.key === OUTBOX && event.newValue === null) {
        useLocal();
        cache.current = null;
        return;
      }
      if (!event.key?.startsWith(OPERATION)) return;
      try {
        refreshView(cache.current);
        setStatus(
          Object.keys(cache.current.conflicts).length
            ? "conflict"
            : Object.keys(cache.current.pending).length
              ? "pending"
              : "synced",
        );
        if (navigator.onLine) void sync();
      } catch (err) {
        showError(err);
      }
    };
    window.addEventListener("online", tick);
    window.addEventListener("focus", tick);
    window.addEventListener("storage", storage);
    return () => {
      controller.abort();
      if (generation.current === sessionGeneration) {
        ++generation.current;
        active.current = false;
        busy.current?.controller.abort();
        busy.current = null;
      }
      clearInterval(timer);
      window.removeEventListener("online", tick);
      window.removeEventListener("focus", tick);
      window.removeEventListener("storage", storage);
    };
  }, []);
  function setBills(update: Bill[] | ((old: Bill[]) => Bill[])) {
    const next =
      typeof update === "function" ? update(currentBills.current) : update;
    try {
      if (active.current && cache.current) {
        cache.current.bills = next;
        commit(next, cache.current);
      } else commit(next);
    } catch (err) {
      showError(err);
    }
  }
  function changeBill(id: string, patch: Partial<Bill>) {
    const old = currentBills.current.find((b) => b.id === id);
    if (!old) throw new Error("Račun nije pronađen.");
    const nextBill = updateBill(old, { ...patch, isDemo: false });
    const next = currentBills.current.map((b) => (b.id === id ? nextBill : b));
    if (active.current && cache.current) {
      validBill(nextBill);
      const c = cache.current,
        prior = c.pending[id];
      const own = readOperations().filter(
        (op) => op.bill.id === id && op.actor === actor.current,
      );
      persistOperation(
        {
          bill: nextBill,
          revision: prior?.revision ?? c.versions[id]?.revision ?? 0,
          base: prior?.base ??
            c.versions[id]?.bill ?? { ...old, isDemo: false },
          ancestors: [
            ...new Set(own.flatMap((op) => [...op.ancestors, op.token])),
          ],
        },
        actor.current,
        own.map((op) => op.token),
      );
      c.bills = next;
      refreshView(c);
      setStatus(Object.keys(c.conflicts).length ? "conflict" : "pending");
      void sync();
    } else commit(next);
  }
  function replaceBills(next: Bill[]) {
    validateBills(next);
    if (active.current) {
      for (const b of next) {
        const old = currentBills.current.find((x) => x.id === b.id);
        if (!old) setBills((all) => [...all, b]);
        changeBill(b.id, b);
      }
    } else commit(next);
  }
  function resolve(id: string, choice: "local" | "remote") {
    if (!active.current) return;
    const c = cache.current,
      remote = c?.conflicts[id],
      pending = c?.pending[id];
    if (!c || !remote || !pending) return;
    const sibling = siblingConflicts.current[id];
    if (sibling) {
      const selected =
        choice === "local" ? sibling.primary : sibling.alternative;
      persistOperation(selected, actor.current, sibling.pairIds);
      delete c.conflicts[id];
      refreshView(c);
      void sync();
      return;
    }
    delete c.conflicts[id];
    c.bills = c.bills.filter((b) => b.id !== id && b.id !== remote.bill.id);
    c.versions[remote.bill.id] = remote;
    if (choice === "remote") {
      removeOperations(pending.operationIds ?? []);
      c.bills.push(remote.bill);
    } else {
      // Explicit choice may adopt the canonical ID after a unique month/provider conflict.
      const bill = {
        ...pending.bill,
        id: remote.bill.id,
        templateId: remote.bill.templateId,
        billingMonth: remote.bill.billingMonth,
      };
      persistOperation(
        {
          bill,
          revision: remote.revision,
          base: remote.bill,
          ancestors: pending.ancestors,
        },
        actor.current,
        pending.operationIds ?? [],
      );
      c.bills.push(bill);
    }
    refreshView(c);
    void sync();
  }
  function useLocal() {
    ++generation.current;
    active.current = false;
    busy.current?.controller.abort();
    busy.current = null;
    setMode("local");
    setEmail("");
    setError("");
    setStatus("anonymous");
    setConflicts({});
    setPendingCount(0);
    const next = ensureMonth(readLocal(), currentMonth.current);
    currentBills.current = next;
    setBillState(next);
  }
  function logout() {
    try {
      // Close the append gate before checking every durable key. A racing append
      // either remains visible here or fails its post-append gate check.
      localStorage.setItem(OUTBOX, "closing");
      if (
        operationKeys().length ||
        (cache.current && Object.keys(cache.current.conflicts).length)
      ) {
        localStorage.setItem(OUTBOX, "1");
        setError(
          "Prvo uskladite izmjene ili preuzmite sigurnosnu kopiju prije odjave.",
        );
        return;
      }
      localStorage.removeItem(FAMILY);
      localStorage.removeItem(OUTBOX);
    } catch (err) {
      showError(err);
      return;
    }
    useLocal();
    cache.current = null;
    location.assign("/api/logout");
  }
  return {
    bills,
    setBills,
    changeBill,
    replaceBills,
    mode,
    email,
    status,
    error,
    pendingCount,
    conflicts,
    resolve,
    sync,
    useLocal,
    logout,
  };
}
