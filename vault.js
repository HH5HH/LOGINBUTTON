export const LOGINBUTTON_VAULT_DB_NAME = "loginbutton-vault";
export const LOGINBUTTON_VAULT_DB_VERSION = 2;
export const LOGINBUTTON_VAULT_SCHEMA_VERSION = 9;
export const LOGINBUTTON_VAULT_EXPORT_SCHEMA_VERSION = 3;
export const LOGINBUTTON_VAULT_EXPORT_SCHEMA = "loginbutton-vault-json-v3";
export const LOGINBUTTON_VAULT_PROGRAMMER_RECORD_TTL_MS = 12 * 60 * 60 * 1000;

const PROGRAMMER_STORE = "programmerRecords";
const ENVIRONMENT_STORE = "environmentGlobals";
const META_STORE = "meta";
const PROGRAMMER_CACHE_LIMIT = 48;
const ENVIRONMENT_CACHE_LIMIT = 12;
const SUPPORTED_SERVICE_KEYS = ["restV2", "esm", "degradation", "resetTempPass", "cm"];

let databasePromise = null;
const programmerRecordCache = new Map();
const environmentGlobalsCache = new Map();

export function buildProgrammerVaultRecordKey({ environmentId, programmerId } = {}) {
  const normalizedEnvironmentId = normalizeIdentifier(environmentId);
  const normalizedProgrammerId = normalizeIdentifier(programmerId);
  if (!normalizedEnvironmentId || !normalizedProgrammerId) {
    return "";
  }

  return `${normalizedEnvironmentId}::${normalizedProgrammerId}`;
}

export async function primeLoginButtonVault() {
  await openVaultDatabase();
  return true;
}

export async function readProgrammerVaultRecord(lookup = {}) {
  const key = buildProgrammerVaultRecordKey(lookup);
  if (!key) {
    return null;
  }

  if (programmerRecordCache.has(key)) {
    const cachedRecord = programmerRecordCache.get(key);
    touchCacheEntry(programmerRecordCache, key, cachedRecord, PROGRAMMER_CACHE_LIMIT);
    return cloneJsonLikeValue(cachedRecord, null);
  }

  const database = await openVaultDatabase();
  const record = await getValue(database, PROGRAMMER_STORE, key);
  if (!record) {
    return null;
  }

  touchCacheEntry(programmerRecordCache, key, record, PROGRAMMER_CACHE_LIMIT);
  return cloneJsonLikeValue(record, null);
}

export async function writeProgrammerVaultRecord(input = null) {
  const normalizedInput = normalizeProgrammerVaultRecordInput(input);
  if (!normalizedInput) {
    return null;
  }

  const existingRecord = await readProgrammerVaultRecord(normalizedInput);
  const nextRecord = normalizeProgrammerVaultRecord(normalizedInput, existingRecord);
  const database = await openVaultDatabase();
  await putValue(database, PROGRAMMER_STORE, nextRecord);
  touchCacheEntry(programmerRecordCache, nextRecord.key, nextRecord, PROGRAMMER_CACHE_LIMIT);
  return cloneJsonLikeValue(nextRecord, null);
}

export async function mergeProgrammerVaultSelections(input = null) {
  const normalizedInput = normalizeProgrammerVaultSelectionInput(input);
  if (!normalizedInput) {
    return null;
  }

  const existingRecord = await readProgrammerVaultRecord(normalizedInput);
  if (!existingRecord) {
    return null;
  }

  const nextRecord = normalizeProgrammerVaultRecord(
    {
      ...existingRecord,
      ...normalizedInput,
      services: existingRecord.services,
      selectedApplications: existingRecord.selectedApplications
    },
    existingRecord
  );
  const database = await openVaultDatabase();
  await putValue(database, PROGRAMMER_STORE, nextRecord);
  touchCacheEntry(programmerRecordCache, nextRecord.key, nextRecord, PROGRAMMER_CACHE_LIMIT);
  return cloneJsonLikeValue(nextRecord, null);
}

export async function deleteProgrammerVaultRecord(lookup = {}) {
  const key = buildProgrammerVaultRecordKey(lookup);
  if (!key) {
    return false;
  }

  const database = await openVaultDatabase();
  await deleteValue(database, PROGRAMMER_STORE, key);
  programmerRecordCache.delete(key);
  return true;
}

export async function listProgrammerVaultRecords() {
  const database = await openVaultDatabase();
  const records = await getAllValues(database, PROGRAMMER_STORE);
  return records
    .map((record) => normalizeProgrammerVaultRecord(record, null))
    .filter(Boolean)
    .sort(compareProgrammerRecords);
}

export function assessProgrammerVaultRecord(record = null, lookup = {}) {
  const normalizedRecord = normalizeProgrammerVaultRecord(record, null);
  if (!normalizedRecord) {
    return {
      reusable: false,
      needsRefresh: true,
      stale: true,
      reason: "missing-record"
    };
  }

  const lookupKey = buildProgrammerVaultRecordKey(lookup);
  if (lookupKey && normalizedRecord.key !== lookupKey) {
    return {
      reusable: false,
      needsRefresh: true,
      stale: true,
      reason: "key-mismatch"
    };
  }

  if (Number(normalizedRecord.schemaVersion || 0) !== LOGINBUTTON_VAULT_SCHEMA_VERSION) {
    return {
      reusable: false,
      needsRefresh: true,
      stale: true,
      reason: "schema-version-changed"
    };
  }

  const reasons = [];
  if (normalizeIdentifier(lookup?.configurationVersion) && lookup.configurationVersion !== normalizedRecord.configurationVersion) {
    reasons.push("configuration-version-changed");
  }
  if (normalizeIdentifier(lookup?.consoleBaseUrl) && lookup.consoleBaseUrl !== normalizedRecord.consoleBaseUrl) {
    reasons.push("console-base-url-changed");
  }
  if (normalizeIdentifier(lookup?.programmerFingerprint) && lookup.programmerFingerprint !== normalizedRecord.programmerFingerprint) {
    reasons.push("programmer-fingerprint-changed");
  }

  const expiresAtMs = Date.parse(firstNonEmptyString([normalizedRecord.expiresAt]));
  const isExpired = Number.isFinite(expiresAtMs) && expiresAtMs > 0 ? Date.now() >= expiresAtMs : false;
  if (isExpired) {
    reasons.push("ttl-expired");
  }

  const hydrationStatus = String(normalizedRecord.hydrationStatus || "").trim();
  if (hydrationStatus && hydrationStatus !== "complete") {
    reasons.push(`hydration-${hydrationStatus}`);
  }

  const stale = reasons.length > 0;
  return {
    reusable: true,
    needsRefresh: stale,
    stale,
    reason: stale ? reasons.join(",") : "ready"
  };
}

export async function readEnvironmentVaultGlobals(environmentId = "") {
  const normalizedEnvironmentId = normalizeIdentifier(environmentId);
  if (!normalizedEnvironmentId) {
    return null;
  }

  if (environmentGlobalsCache.has(normalizedEnvironmentId)) {
    const cachedRecord = environmentGlobalsCache.get(normalizedEnvironmentId);
    touchCacheEntry(environmentGlobalsCache, normalizedEnvironmentId, cachedRecord, ENVIRONMENT_CACHE_LIMIT);
    return cloneJsonLikeValue(cachedRecord, null);
  }

  const database = await openVaultDatabase();
  const record = await getValue(database, ENVIRONMENT_STORE, normalizedEnvironmentId);
  if (!record) {
    return null;
  }

  touchCacheEntry(environmentGlobalsCache, normalizedEnvironmentId, record, ENVIRONMENT_CACHE_LIMIT);
  return cloneJsonLikeValue(record, null);
}

export async function writeEnvironmentVaultGlobals(input = null) {
  const normalizedInput = normalizeEnvironmentGlobalsRecordInput(input);
  if (!normalizedInput) {
    return null;
  }

  const existingRecord = await readEnvironmentVaultGlobals(normalizedInput.environmentId);
  const nextRecord = normalizeEnvironmentGlobalsRecord(normalizedInput, existingRecord);
  const database = await openVaultDatabase();
  await putValue(database, ENVIRONMENT_STORE, nextRecord);
  touchCacheEntry(environmentGlobalsCache, nextRecord.environmentId, nextRecord, ENVIRONMENT_CACHE_LIMIT);
  return cloneJsonLikeValue(nextRecord, null);
}

export async function listEnvironmentVaultGlobals() {
  const database = await openVaultDatabase();
  const records = await getAllValues(database, ENVIRONMENT_STORE);
  return records
    .map((record) => normalizeEnvironmentGlobalsRecord(record, null))
    .filter(Boolean)
    .sort((left, right) =>
      String(left?.environmentLabel || left?.environmentId || "").localeCompare(
        String(right?.environmentLabel || right?.environmentId || ""),
        undefined,
        { sensitivity: "base" }
      )
    );
}

export async function exportLoginButtonVaultSnapshot() {
  const [environmentRecords, programmerRecords] = await Promise.all([
    listEnvironmentVaultGlobals(),
    listProgrammerVaultRecords()
  ]);
  const exportedAt = new Date().toISOString();
  const environments = {};
  const compactProgrammerRecords = programmerRecords
    .map((record) => buildCompactProgrammerVaultExportRecord(record))
    .filter(Boolean);

  environmentRecords.forEach((record) => {
    environments[record.environmentId] = {
      key: record.environmentId,
      label: firstNonEmptyString([record.environmentLabel, record.environmentId]),
      updatedAt: firstNonEmptyString([record.updatedAt]),
      mediaCompanies: {}
    };
  });

  compactProgrammerRecords.forEach((record) => {
    if (!environments[record.environmentId]) {
      environments[record.environmentId] = {
        key: record.environmentId,
        label: firstNonEmptyString([record.environmentLabel, record.environmentId]),
        updatedAt: firstNonEmptyString([record.updatedAt]),
        mediaCompanies: {}
      };
    }
    environments[record.environmentId].mediaCompanies[record.programmerId] = cloneJsonLikeValue(record, null);
    environments[record.environmentId].updatedAt = firstNonEmptyString([
      record.updatedAt,
      environments[record.environmentId].updatedAt,
      exportedAt
    ]);
  });

  return {
    schema: LOGINBUTTON_VAULT_EXPORT_SCHEMA,
    schemaVersion: LOGINBUTTON_VAULT_EXPORT_SCHEMA_VERSION,
    exportedAt,
    stats: {
      environmentCount: Object.keys(environments).length,
      programmerRecordCount: compactProgrammerRecords.length,
      serviceClientCount: countServiceClients(compactProgrammerRecords)
    },
    loginbutton: {
      globals: {
        savedQueries: {},
        cmGlobalsByEnvironment: Object.fromEntries(
          environmentRecords.map((record) => [
            record.environmentId,
            {
              environmentId: record.environmentId,
              environmentLabel: record.environmentLabel,
              cmGlobal: cloneJsonLikeValue(record.cmGlobal, null),
              cmTenants: cloneJsonLikeValue(record.cmTenants, null),
              updatedAt: record.updatedAt
            }
          ])
        )
      }
    },
    pass: {
      environments
    }
  };
}

export async function importLoginButtonVaultSnapshot(payload = null, { replaceExisting = false } = {}) {
  const normalizedPayload = normalizeVaultImportPayload(payload);
  if (!normalizedPayload) {
    throw new Error("The selected file is not a LoginButton VAULT JSON export.");
  }

  if (replaceExisting) {
    programmerRecordCache.clear();
    environmentGlobalsCache.clear();
  }

  const database = await openVaultDatabase();
  const existingEnvironmentRecordsById = replaceExisting
    ? new Map()
    : new Map(
        (await getAllValues(database, ENVIRONMENT_STORE))
          .map((record) => normalizeEnvironmentGlobalsRecord(record, null))
          .filter(Boolean)
          .map((record) => [record.environmentId, record])
      );
  const existingProgrammerRecordsByKey = replaceExisting
    ? new Map()
    : new Map(
        (await getAllValues(database, PROGRAMMER_STORE))
          .map((record) => normalizeProgrammerVaultRecord(record, null))
          .filter(Boolean)
          .map((record) => [record.key, record])
      );
  await runTransaction(database, [PROGRAMMER_STORE, ENVIRONMENT_STORE, META_STORE], "readwrite", (transaction) => {
    const programmerStore = transaction.objectStore(PROGRAMMER_STORE);
    const environmentStore = transaction.objectStore(ENVIRONMENT_STORE);
    const metaStore = transaction.objectStore(META_STORE);

    if (replaceExisting === true) {
      programmerStore.clear();
      environmentStore.clear();
      metaStore.clear();
    }

    normalizedPayload.environmentRecords.forEach((record) => {
      const existingRecord = replaceExisting !== true ? existingEnvironmentRecordsById.get(record.environmentId) || null : null;
      const nextRecord = normalizeEnvironmentGlobalsRecord(record, existingRecord);
      environmentStore.put(nextRecord);
      touchCacheEntry(environmentGlobalsCache, nextRecord.environmentId, nextRecord, ENVIRONMENT_CACHE_LIMIT);
    });

    normalizedPayload.programmerRecords.forEach((record) => {
      const key = buildProgrammerVaultRecordKey(record);
      const existingRecord = replaceExisting !== true ? existingProgrammerRecordsByKey.get(key) || null : null;
      const nextRecord = normalizeProgrammerVaultRecord(record, existingRecord);
      programmerStore.put(nextRecord);
      touchCacheEntry(programmerRecordCache, nextRecord.key, nextRecord, PROGRAMMER_CACHE_LIMIT);
    });
  });

  return {
    importedEnvironmentCount: normalizedPayload.environmentRecords.length,
    importedProgrammerRecordCount: normalizedPayload.programmerRecords.length,
    importedServiceClientCount: countServiceClients(normalizedPayload.programmerRecords)
  };
}

export async function clearLoginButtonVault() {
  const database = await openVaultDatabase();
  await runTransaction(database, [PROGRAMMER_STORE, ENVIRONMENT_STORE, META_STORE], "readwrite", (transaction) => {
    transaction.objectStore(PROGRAMMER_STORE).clear();
    transaction.objectStore(ENVIRONMENT_STORE).clear();
    transaction.objectStore(META_STORE).clear();
  });
  programmerRecordCache.clear();
  environmentGlobalsCache.clear();
  return true;
}

export async function getLoginButtonVaultStats() {
  const [environmentRecords, programmerRecords] = await Promise.all([
    listEnvironmentVaultGlobals(),
    listProgrammerVaultRecords()
  ]);

  return {
    schema: LOGINBUTTON_VAULT_EXPORT_SCHEMA,
    schemaVersion: LOGINBUTTON_VAULT_EXPORT_SCHEMA_VERSION,
    environmentCount: environmentRecords.length,
    programmerRecordCount: programmerRecords.length,
    serviceClientCount: countServiceClients(programmerRecords)
  };
}

function openVaultDatabase() {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(LOGINBUTTON_VAULT_DB_NAME, LOGINBUTTON_VAULT_DB_VERSION);
    request.onerror = () => {
      reject(request.error || new Error("Unable to open LoginButton VAULT database."));
    };
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROGRAMMER_STORE)) {
        const programmerStore = database.createObjectStore(PROGRAMMER_STORE, {
          keyPath: "key"
        });
        programmerStore.createIndex("byEnvironmentId", "environmentId", {
          unique: false
        });
        programmerStore.createIndex("byUpdatedAt", "updatedAt", {
          unique: false
        });
      }
      if (!database.objectStoreNames.contains(ENVIRONMENT_STORE)) {
        database.createObjectStore(ENVIRONMENT_STORE, {
          keyPath: "environmentId"
        });
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, {
          keyPath: "key"
        });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
  });

  return databasePromise;
}

function getValue(database, storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).get(key);
    request.onerror = () => {
      reject(request.error || new Error(`Unable to read ${storeName}.`));
    };
    request.onsuccess = () => {
      resolve(request.result || null);
    };
  });
}

function getAllValues(database, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readonly");
    const request = transaction.objectStore(storeName).getAll();
    request.onerror = () => {
      reject(request.error || new Error(`Unable to list ${storeName}.`));
    };
    request.onsuccess = () => {
      resolve(Array.isArray(request.result) ? request.result : []);
    };
  });
}

function putValue(database, storeName, value) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const request = transaction.objectStore(storeName).put(value);
    request.onerror = () => {
      reject(request.error || new Error(`Unable to write ${storeName}.`));
    };
    transaction.oncomplete = () => {
      resolve(value);
    };
    transaction.onerror = () => {
      reject(transaction.error || new Error(`Unable to commit ${storeName}.`));
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error(`Unable to commit ${storeName}.`));
    };
  });
}

function deleteValue(database, storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite");
    const request = transaction.objectStore(storeName).delete(key);
    request.onerror = () => {
      reject(request.error || new Error(`Unable to delete ${storeName}.`));
    };
    transaction.oncomplete = () => {
      resolve(true);
    };
    transaction.onerror = () => {
      reject(transaction.error || new Error(`Unable to delete ${storeName}.`));
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error(`Unable to delete ${storeName}.`));
    };
  });
}

function runTransaction(database, storeNames, mode, work) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, mode);
    try {
      work(transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      resolve(true);
    };
    transaction.onerror = () => {
      reject(transaction.error || new Error("LoginButton VAULT transaction failed."));
    };
    transaction.onabort = () => {
      reject(transaction.error || new Error("LoginButton VAULT transaction aborted."));
    };
  });
}

function normalizeProgrammerVaultRecordInput(input = null) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const environmentId = normalizeIdentifier(input.environmentId);
  const programmerId = normalizeIdentifier(input.programmerId);
  if (!environmentId || !programmerId) {
    return null;
  }

  return {
    ...cloneJsonLikeValue(input, {}),
    environmentId,
    programmerId
  };
}

function normalizeProgrammerVaultSelectionInput(input = null) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const environmentId = normalizeIdentifier(input.environmentId);
  const programmerId = normalizeIdentifier(input.programmerId);
  if (!environmentId || !programmerId) {
    return null;
  }

  return {
    environmentId,
    programmerId,
    selectedRegisteredApplicationId: normalizeIdentifier(input.selectedRegisteredApplicationId),
    selectedRequestorId: normalizeIdentifier(input.selectedRequestorId),
    selectedMvpdId: normalizeIdentifier(input.selectedMvpdId),
    selectedCmTenantId: normalizeIdentifier(input.selectedCmTenantId)
  };
}

function normalizeProgrammerVaultRecord(input = null, existingRecord = null) {
  const normalizedInput = normalizeProgrammerVaultRecordInput(input);
  if (!normalizedInput) {
    return null;
  }

  const normalizedExistingRecord = normalizeProgrammerVaultRecordInput(existingRecord) ? existingRecord : null;
  const key = buildProgrammerVaultRecordKey(normalizedInput);
  const nowIso = new Date().toISOString();
  const maxAgeMs = normalizePositiveInteger([
    normalizedInput.maxAgeMs,
    normalizedExistingRecord?.maxAgeMs,
    LOGINBUTTON_VAULT_PROGRAMMER_RECORD_TTL_MS
  ]);
  const updatedAt = firstNonEmptyString([normalizedInput.updatedAt, nowIso]);
  const hydratedAt = firstNonEmptyString([normalizedInput.hydratedAt, normalizedExistingRecord?.hydratedAt, updatedAt]);
  const expiresAt = firstNonEmptyString([
    normalizedInput.expiresAt,
    computeExpiresAt(updatedAt, maxAgeMs),
    normalizedExistingRecord?.expiresAt
  ]);
  const services = normalizeProgrammerVaultServices(
    normalizedInput.services,
    normalizedExistingRecord?.services,
    updatedAt
  );
  const selectedApplications = normalizeSelectedApplications(
    normalizedInput.selectedApplications,
    services,
    normalizedExistingRecord?.selectedApplications
  );
  const hydrationStatus = deriveHydrationStatus(
    firstNonEmptyString([normalizedInput.hydrationStatus, normalizedExistingRecord?.hydrationStatus]),
    services
  );

  return {
    key,
    schemaVersion: LOGINBUTTON_VAULT_SCHEMA_VERSION,
    environmentId: normalizedInput.environmentId,
    environmentLabel: firstNonEmptyString([
      normalizedInput.environmentLabel,
      normalizedExistingRecord?.environmentLabel,
      normalizedInput.environmentId
    ]),
    programmerId: normalizedInput.programmerId,
    programmerKey: firstNonEmptyString([
      normalizedInput.programmerKey,
      normalizedExistingRecord?.programmerKey,
      normalizedInput.programmerId
    ]),
    programmerName: firstNonEmptyString([
      normalizedInput.programmerName,
      normalizedExistingRecord?.programmerName,
      normalizedInput.programmerId
    ]),
    programmerLabel: firstNonEmptyString([
      normalizedInput.programmerLabel,
      normalizedExistingRecord?.programmerLabel,
      normalizedInput.programmerName,
      normalizedInput.programmerId
    ]),
    consoleBaseUrl: firstNonEmptyString([normalizedInput.consoleBaseUrl, normalizedExistingRecord?.consoleBaseUrl]),
    configurationVersion: firstNonEmptyString([
      normalizedInput.configurationVersion,
      normalizedExistingRecord?.configurationVersion
    ]),
    programmerFingerprint: firstNonEmptyString([
      normalizedInput.programmerFingerprint,
      normalizedExistingRecord?.programmerFingerprint
    ]),
    hydrationStatus,
    selectedRegisteredApplicationId: normalizeIdentifier(
      firstNonEmptyString([
        normalizedInput.selectedRegisteredApplicationId,
        normalizedExistingRecord?.selectedRegisteredApplicationId
      ])
    ),
    selectedRequestorId: Object.prototype.hasOwnProperty.call(normalizedInput, "selectedRequestorId")
      ? normalizeIdentifier(normalizedInput.selectedRequestorId)
      : normalizeIdentifier(firstNonEmptyString([normalizedExistingRecord?.selectedRequestorId])),
    selectedMvpdId: Object.prototype.hasOwnProperty.call(normalizedInput, "selectedMvpdId")
      ? normalizeIdentifier(normalizedInput.selectedMvpdId)
      : normalizeIdentifier(firstNonEmptyString([normalizedExistingRecord?.selectedMvpdId])),
    selectedCmTenantId: normalizeIdentifier(
      firstNonEmptyString([normalizedInput.selectedCmTenantId, normalizedExistingRecord?.selectedCmTenantId])
    ),
    selectedApplications,
    services,
    maxAgeMs,
    source: firstNonEmptyString([normalizedInput.source, normalizedExistingRecord?.source, "network"]),
    hydratedAt,
    updatedAt,
    expiresAt,
    lastSelectedAt: firstNonEmptyString([
      normalizedInput.lastSelectedAt,
      normalizedExistingRecord?.lastSelectedAt,
      updatedAt
    ])
  };
}

function normalizeSelectedApplications(selectedApplications = [], services = {}, existingSelectedApplications = []) {
  const seen = new Set();
  const merged = []
    .concat(Array.isArray(selectedApplications) ? selectedApplications : [])
    .concat(
      SUPPORTED_SERVICE_KEYS.map((serviceKey) => services?.[serviceKey]?.registeredApplication).filter(Boolean)
    )
    .concat(Array.isArray(existingSelectedApplications) ? existingSelectedApplications : []);

  return merged.reduce((result, application) => {
    const normalizedApplication = normalizeCompactApplication(application);
    if (!normalizedApplication) {
      return result;
    }
    const cacheKey = firstNonEmptyString([normalizedApplication.id, normalizedApplication.key]);
    if (!cacheKey || seen.has(cacheKey)) {
      return result;
    }
    seen.add(cacheKey);
    result.push(normalizedApplication);
    return result;
  }, []);
}

function normalizeProgrammerVaultServices(services = null, existingServices = null, updatedAt = "") {
  const normalizedServices = {};

  SUPPORTED_SERVICE_KEYS.forEach((serviceKey) => {
    if (serviceKey === "cm") {
      normalizedServices.cm = normalizeCmServiceRecord(
        services?.cm,
        existingServices?.cm,
        updatedAt
      );
      return;
    }

    normalizedServices[serviceKey] = normalizeDcrServiceRecord(
      serviceKey,
      services?.[serviceKey],
      existingServices?.[serviceKey],
      updatedAt
    );
  });

  return normalizedServices;
}

function normalizeDcrServiceRecord(serviceKey = "", record = null, existingRecord = null, updatedAt = "") {
  const normalizedServiceKey = String(serviceKey || "").trim();
  const nextRecord = record && typeof record === "object" ? record : {};
  const previousRecord = existingRecord && typeof existingRecord === "object" ? existingRecord : {};
  const registeredApplication = normalizeCompactApplication(
    nextRecord.registeredApplication || previousRecord.registeredApplication || null
  );
  const client = normalizeServiceClient(nextRecord.client || previousRecord.client || null);
  const availability = Boolean(nextRecord.available === true || previousRecord.available === true || registeredApplication);

  return {
    key: normalizedServiceKey,
    label: firstNonEmptyString([nextRecord.label, previousRecord.label, normalizedServiceKey]),
    available: availability,
    requiredScope: firstNonEmptyString([nextRecord.requiredScope, previousRecord.requiredScope]),
    registeredApplication,
    client,
    updatedAt: firstNonEmptyString([nextRecord.updatedAt, previousRecord.updatedAt, updatedAt]),
    status: firstNonEmptyString([
      nextRecord.status,
      previousRecord.status,
      availability ? (client?.clientId && client?.clientSecret ? "ready" : "pending") : "unavailable"
    ])
  };
}

function normalizeCmServiceRecord(record = null, existingRecord = null, updatedAt = "") {
  const nextRecord = record && typeof record === "object" ? record : {};
  const previousRecord = existingRecord && typeof existingRecord === "object" ? existingRecord : {};
  const matchedTenants = normalizeMatchedTenants(nextRecord.matchedTenants || previousRecord.matchedTenants || []);
  const matchedTenantCount = Math.max(
    Number(nextRecord.matchedTenantCount || 0),
    Number(previousRecord.matchedTenantCount || 0),
    matchedTenants.length
  );

  return {
    key: "cm",
    label: firstNonEmptyString([nextRecord.label, previousRecord.label, "Concurrency Monitoring"]),
    available:
      nextRecord.available === true ||
      previousRecord.available === true ||
      matchedTenantCount > 0,
    checked: nextRecord.checked === true || previousRecord.checked === true || matchedTenantCount > 0,
    matchedTenantCount,
    matchedTenants,
    sourceUrl: firstNonEmptyString([nextRecord.sourceUrl, previousRecord.sourceUrl]),
    loadError: firstNonEmptyString([nextRecord.loadError, previousRecord.loadError]),
    updatedAt: firstNonEmptyString([nextRecord.updatedAt, previousRecord.updatedAt, updatedAt]),
    status: firstNonEmptyString([
      nextRecord.status,
      previousRecord.status,
      matchedTenantCount > 0 ? "ready" : nextRecord.checked === true || previousRecord.checked === true ? "checked" : "pending"
    ])
  };
}

function normalizeMatchedTenants(tenants = []) {
  return (Array.isArray(tenants) ? tenants : [])
    .map((tenant) => normalizeCompactTenant(tenant))
    .filter(Boolean);
}

function normalizeCompactApplication(application = null) {
  if (!application || typeof application !== "object") {
    return null;
  }

  const guid = normalizeIdentifier(
    firstNonEmptyString([
      extractApplicationGuid(application.guid),
      extractApplicationGuid(application.id),
      extractApplicationGuid(application.key)
    ])
  );
  const id = normalizeIdentifier(firstNonEmptyString([guid, application.id, application.key]));
  const key = normalizeIdentifier(firstNonEmptyString([guid, application.key, application.id]));
  if (!id && !key) {
    return null;
  }

  const scopes = uniqueStrings(application.scopes);
  const serviceProviders = uniqueStrings(
    []
      .concat(Array.isArray(application.serviceProviders) ? application.serviceProviders : [])
      .concat(Array.isArray(application.contentProviders) ? application.contentProviders : [])
      .concat(Array.isArray(application.requestorIds) ? application.requestorIds : [])
      .concat(Array.isArray(application.requestors) ? application.requestors : [])
      .concat(
        firstNonEmptyString([application.requestor]) ? [application.requestor] : [],
        firstNonEmptyString([application.serviceProvider]) ? [application.serviceProvider] : []
      )
  );
  return {
    key: key || id,
    id: id || key,
    guid: guid || id || key,
    name: firstNonEmptyString([application.name, application.label, id, key]),
    label: firstNonEmptyString([application.label, application.name, id, key]),
    clientId: firstNonEmptyString([application.clientId]),
    scopes,
    scopeLabels: uniqueStrings(application.scopeLabels),
    type: firstNonEmptyString([application.type]),
    serviceProviders,
    requestor: firstNonEmptyString([
      application.requestor,
      application.serviceProvider
    ]),
    softwareStatement: firstNonEmptyString([application.softwareStatement]),
    updatedAt: firstNonEmptyString([application.updatedAt])
  };
}

function extractApplicationGuid(value = "") {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return "";
  }

  const prefixedMatch = normalizedValue.match(/^@?RegisteredApplication:(.+)$/i);
  if (prefixedMatch) {
    return String(prefixedMatch[1] || "").trim();
  }

  const tokenMatch = normalizedValue.match(/@?RegisteredApplication:([A-Za-z0-9-]+)/i);
  if (tokenMatch) {
    return String(tokenMatch[1] || "").trim();
  }

  return normalizedValue;
}

function normalizeCompactTenant(tenant = null) {
  if (!tenant || typeof tenant !== "object") {
    return null;
  }

  const id = normalizeIdentifier(firstNonEmptyString([tenant.id, tenant.key]));
  const key = normalizeIdentifier(firstNonEmptyString([tenant.key, tenant.id]));
  if (!id && !key) {
    return null;
  }

  return {
    key: key || id,
    id: id || key,
    name: firstNonEmptyString([tenant.name, tenant.label, id, key]),
    label: firstNonEmptyString([tenant.label, tenant.name, id, key])
  };
}

function normalizeServiceClient(client = null) {
  if (!client || typeof client !== "object") {
    return null;
  }

  const clientId = firstNonEmptyString([client.clientId]);
  const clientSecret = firstNonEmptyString([client.clientSecret]);
  const accessToken = firstNonEmptyString([client.accessToken]);
  const tokenExpiresAt = firstNonEmptyString([client.tokenExpiresAt]);
  const error = firstNonEmptyString([client.error]);
  if (!clientId && !clientSecret && !accessToken && !tokenExpiresAt && !error) {
    return null;
  }

  return {
    clientId,
    clientSecret,
    accessToken,
    tokenExpiresAt,
    tokenScope: firstNonEmptyString([client.tokenScope]),
    tokenRequestedScope: firstNonEmptyString([client.tokenRequestedScope]),
    serviceScope: firstNonEmptyString([client.serviceScope]),
    updatedAt: firstNonEmptyString([client.updatedAt]),
    error
  };
}

function deriveHydrationStatus(currentStatus = "", services = {}) {
  const explicitStatus = String(currentStatus || "").trim();
  if (explicitStatus) {
    return explicitStatus;
  }

  const dcrServiceKeys = SUPPORTED_SERVICE_KEYS.filter((serviceKey) => serviceKey !== "cm");
  const availableCount = dcrServiceKeys.filter((serviceKey) => services?.[serviceKey]?.available === true).length;
  const readyCount = dcrServiceKeys.filter((serviceKey) => {
    const client = services?.[serviceKey]?.client;
    return services?.[serviceKey]?.available === true && client?.clientId && client?.clientSecret;
  }).length;

  if (availableCount === 0) {
    return "pending";
  }
  if (readyCount === availableCount) {
    return "complete";
  }
  if (readyCount > 0) {
    return "partial";
  }
  return "pending";
}

function normalizeEnvironmentGlobalsRecordInput(input = null) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const environmentId = normalizeIdentifier(input.environmentId);
  if (!environmentId) {
    return null;
  }

  return {
    ...cloneJsonLikeValue(input, {}),
    environmentId
  };
}

function normalizeEnvironmentGlobalsRecord(input = null, existingRecord = null) {
  const normalizedInput = normalizeEnvironmentGlobalsRecordInput(input);
  if (!normalizedInput) {
    return null;
  }

  const currentExistingRecord = normalizeEnvironmentGlobalsRecordInput(existingRecord) ? existingRecord : null;
  const updatedAt = firstNonEmptyString([normalizedInput.updatedAt, new Date().toISOString()]);
  return {
    schemaVersion: LOGINBUTTON_VAULT_SCHEMA_VERSION,
    environmentId: normalizedInput.environmentId,
    environmentLabel: firstNonEmptyString([
      normalizedInput.environmentLabel,
      currentExistingRecord?.environmentLabel,
      normalizedInput.environmentId
    ]),
    cmGlobal: normalizeCmGlobalRecord(
      normalizedInput.cmGlobal,
      currentExistingRecord?.cmGlobal,
      updatedAt
    ),
    cmTenants: normalizeCmTenantCatalog(
      normalizedInput.cmTenants,
      currentExistingRecord?.cmTenants,
      updatedAt
    ),
    savedQueries:
      normalizedInput.savedQueries && typeof normalizedInput.savedQueries === "object" && !Array.isArray(normalizedInput.savedQueries)
        ? cloneJsonLikeValue(normalizedInput.savedQueries, {})
        : currentExistingRecord?.savedQueries && typeof currentExistingRecord.savedQueries === "object"
          ? cloneJsonLikeValue(currentExistingRecord.savedQueries, {})
          : {},
    updatedAt
  };
}

function normalizeCmGlobalRecord(record = null, existingRecord = null, updatedAt = "") {
  const nextRecord = record && typeof record === "object" ? record : {};
  const previousRecord = existingRecord && typeof existingRecord === "object" ? existingRecord : {};
  const tokenPresent =
    nextRecord.tokenPresent === true ||
    Boolean(firstNonEmptyString([nextRecord.cmuTokenHeaderValue])) ||
    previousRecord.tokenPresent === true;

  return {
    status: firstNonEmptyString([nextRecord.status, previousRecord.status]),
    cmuTokenHeaderName: firstNonEmptyString([nextRecord.cmuTokenHeaderName, previousRecord.cmuTokenHeaderName]),
    cmuTokenClientId: firstNonEmptyString([nextRecord.cmuTokenClientId, previousRecord.cmuTokenClientId]),
    cmuTokenScope: firstNonEmptyString([nextRecord.cmuTokenScope, previousRecord.cmuTokenScope]),
    cmuTokenUserId: firstNonEmptyString([nextRecord.cmuTokenUserId, previousRecord.cmuTokenUserId]),
    cmuTokenSource: firstNonEmptyString([nextRecord.cmuTokenSource, previousRecord.cmuTokenSource]),
    cmuTokenExpiresAt: firstNonEmptyString([nextRecord.cmuTokenExpiresAt, previousRecord.cmuTokenExpiresAt]),
    updatedAt: firstNonEmptyString([nextRecord.updatedAt, previousRecord.updatedAt, updatedAt]),
    tokenPresent
  };
}

function normalizeCmTenantCatalog(record = null, existingRecord = null, updatedAt = "") {
  const nextRecord = record && typeof record === "object" ? record : {};
  const previousRecord = existingRecord && typeof existingRecord === "object" ? existingRecord : {};
  const tenants = normalizeMatchedTenants(nextRecord.tenants || previousRecord.tenants || []);
  return {
    fetchedAt: firstNonEmptyString([nextRecord.fetchedAt, previousRecord.fetchedAt, updatedAt]),
    tenantCount: Math.max(Number(nextRecord.tenantCount || 0), Number(previousRecord.tenantCount || 0), tenants.length),
    tenants
  };
}

function normalizeVaultImportPayload(payload = null) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const environmentRecords = [];
  const programmerRecords = [];
  const globalsByEnvironment =
    payload?.loginbutton?.globals?.cmGlobalsByEnvironment &&
    typeof payload.loginbutton.globals.cmGlobalsByEnvironment === "object" &&
    !Array.isArray(payload.loginbutton.globals.cmGlobalsByEnvironment)
      ? payload.loginbutton.globals.cmGlobalsByEnvironment
      : {};

  Object.entries(globalsByEnvironment).forEach(([environmentId, record]) => {
    const normalizedRecord = normalizeEnvironmentGlobalsRecord(
      {
        environmentId,
        environmentLabel: record?.environmentLabel,
        cmGlobal: record?.cmGlobal,
        cmTenants: record?.cmTenants,
        updatedAt: record?.updatedAt
      },
      null
    );
    if (normalizedRecord) {
      environmentRecords.push(normalizedRecord);
    }
  });

  const environmentGlobals = Array.isArray(payload.environmentGlobals)
    ? payload.environmentGlobals
    : [];
  environmentGlobals.forEach((record) => {
    const normalizedRecord = normalizeEnvironmentGlobalsRecord(record, null);
    if (normalizedRecord) {
      environmentRecords.push(normalizedRecord);
    }
  });

  const passEnvironments =
    payload?.pass?.environments && typeof payload.pass.environments === "object" && !Array.isArray(payload.pass.environments)
      ? payload.pass.environments
      : null;
  if (passEnvironments) {
    Object.entries(passEnvironments).forEach(([environmentId, environmentRecord]) => {
      const normalizedEnvironmentRecord = normalizeEnvironmentGlobalsRecord(
        {
          environmentId,
          environmentLabel: environmentRecord?.label,
          cmGlobal: environmentRecord?.cmGlobal,
          cmTenants: environmentRecord?.cmTenants,
          updatedAt: environmentRecord?.updatedAt
        },
        null
      );
      if (normalizedEnvironmentRecord) {
        environmentRecords.push(normalizedEnvironmentRecord);
      }
    });
  }

  const normalizedEnvironmentRecords = dedupeEnvironmentRecords(environmentRecords);
  const environmentRecordsById = new Map(
    normalizedEnvironmentRecords.map((record) => [record.environmentId, record])
  );

  if (Array.isArray(payload.programmerRecords)) {
    payload.programmerRecords.forEach((record) => {
      const inflatedRecord = inflateCompactProgrammerVaultImportRecord(
        record,
        record?.environmentId,
        record?.environmentLabel,
        environmentRecordsById.get(normalizeIdentifier(record?.environmentId))
      );
      const normalizedRecord = normalizeProgrammerVaultRecord(inflatedRecord, null);
      if (normalizedRecord) {
        programmerRecords.push(normalizedRecord);
      }
    });
  }

  if (passEnvironments) {
    Object.entries(passEnvironments).forEach(([environmentId, environmentRecord]) => {
      const mediaCompanies =
        environmentRecord?.mediaCompanies && typeof environmentRecord.mediaCompanies === "object" && !Array.isArray(environmentRecord.mediaCompanies)
          ? environmentRecord.mediaCompanies
          : {};
      Object.entries(mediaCompanies).forEach(([programmerId, programmerRecord]) => {
        const inflatedProgrammerRecord = inflateCompactProgrammerVaultImportRecord(
          programmerRecord,
          environmentId,
          environmentRecord?.label,
          environmentRecordsById.get(normalizeIdentifier(environmentId))
        );
        const normalizedProgrammerRecord = normalizeProgrammerVaultRecord(
          {
            ...cloneJsonLikeValue(inflatedProgrammerRecord, {}),
            environmentId,
            environmentLabel: environmentRecord?.label,
            programmerId
          },
          null
        );
        if (normalizedProgrammerRecord) {
          programmerRecords.push(normalizedProgrammerRecord);
        }
      });
    });
  }

  if (environmentRecords.length === 0 && programmerRecords.length === 0) {
    return null;
  }

  return {
    environmentRecords: normalizedEnvironmentRecords,
    programmerRecords: dedupeProgrammerRecords(programmerRecords)
  };
}

function dedupeProgrammerRecords(records = []) {
  const deduped = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    if (!record?.key) {
      return;
    }
    deduped.set(record.key, record);
  });
  return Array.from(deduped.values()).sort(compareProgrammerRecords);
}

function dedupeEnvironmentRecords(records = []) {
  const deduped = new Map();
  (Array.isArray(records) ? records : []).forEach((record) => {
    if (!record?.environmentId) {
      return;
    }
    const existingRecord = deduped.get(record.environmentId) || null;
    deduped.set(
      record.environmentId,
      normalizeEnvironmentGlobalsRecord(record, existingRecord)
    );
  });
  return Array.from(deduped.values());
}

function buildCompactProgrammerVaultExportRecord(record = null) {
  const normalizedRecord = normalizeProgrammerVaultRecord(record, null);
  if (!normalizedRecord) {
    return null;
  }

  const registeredApplicationsById = buildCompactRegisteredApplicationsById(
    []
      .concat(Array.isArray(normalizedRecord.selectedApplications) ? normalizedRecord.selectedApplications : [])
      .concat(
        SUPPORTED_SERVICE_KEYS.map((serviceKey) => normalizedRecord.services?.[serviceKey]?.registeredApplication).filter(Boolean)
      )
  );

  return {
    key: normalizedRecord.key,
    schemaVersion: normalizedRecord.schemaVersion,
    environmentId: normalizedRecord.environmentId,
    environmentLabel: normalizedRecord.environmentLabel,
    programmerId: normalizedRecord.programmerId,
    programmerKey: normalizedRecord.programmerKey,
    programmerName: normalizedRecord.programmerName,
    programmerLabel: normalizedRecord.programmerLabel,
    consoleBaseUrl: normalizedRecord.consoleBaseUrl,
    configurationVersion: normalizedRecord.configurationVersion,
    programmerFingerprint: normalizedRecord.programmerFingerprint,
    hydrationStatus: normalizedRecord.hydrationStatus,
    selectedRegisteredApplicationId: normalizedRecord.selectedRegisteredApplicationId,
    selectedRequestorId: normalizedRecord.selectedRequestorId,
    selectedMvpdId: normalizedRecord.selectedMvpdId,
    selectedCmTenantId: normalizedRecord.selectedCmTenantId,
    registeredApplicationsById,
    services: buildCompactProgrammerVaultExportServices(normalizedRecord.services),
    maxAgeMs: normalizedRecord.maxAgeMs,
    source: normalizedRecord.source,
    hydratedAt: normalizedRecord.hydratedAt,
    updatedAt: normalizedRecord.updatedAt,
    expiresAt: normalizedRecord.expiresAt,
    lastSelectedAt: normalizedRecord.lastSelectedAt
  };
}

function buildCompactProgrammerVaultExportServices(services = null) {
  const currentServices = services && typeof services === "object" ? services : {};
  const compactServices = {};

  SUPPORTED_SERVICE_KEYS.forEach((serviceKey) => {
    const currentService = currentServices?.[serviceKey];
    if (serviceKey === "cm") {
      compactServices.cm = buildCompactCmServiceExportRecord(currentService);
      return;
    }

    compactServices[serviceKey] = buildCompactDcrServiceExportRecord(serviceKey, currentService);
  });

  return compactServices;
}

function buildCompactDcrServiceExportRecord(serviceKey = "", record = null) {
  const normalizedRecord = normalizeDcrServiceRecord(serviceKey, record, null, "");
  const registeredApplicationId = firstNonEmptyString([
    normalizedRecord?.registeredApplication?.id,
    normalizedRecord?.registeredApplication?.key
  ]);
  return {
    key: normalizedRecord.key,
    label: normalizedRecord.label,
    available: normalizedRecord.available === true,
    requiredScope: normalizedRecord.requiredScope,
    registeredApplicationId,
    client: cloneJsonLikeValue(normalizedRecord.client, null),
    updatedAt: normalizedRecord.updatedAt,
    status: normalizedRecord.status
  };
}

function buildCompactCmServiceExportRecord(record = null) {
  const normalizedRecord = normalizeCmServiceRecord(record, null, "");
  return {
    key: normalizedRecord.key,
    label: normalizedRecord.label,
    available: normalizedRecord.available === true,
    checked: normalizedRecord.checked === true,
    matchedTenantCount: Number(normalizedRecord.matchedTenantCount || 0),
    matchedTenantIds: normalizeMatchedTenants(normalizedRecord.matchedTenants).map((tenant) =>
      firstNonEmptyString([tenant?.id, tenant?.key])
    ),
    sourceUrl: normalizedRecord.sourceUrl,
    loadError: normalizedRecord.loadError,
    updatedAt: normalizedRecord.updatedAt,
    status: normalizedRecord.status
  };
}

function buildCompactRegisteredApplicationsById(applications = []) {
  const compactApplications = {};
  (Array.isArray(applications) ? applications : []).forEach((application) => {
    const normalizedApplication = normalizeCompactApplication(application);
    const applicationId = firstNonEmptyString([normalizedApplication?.id, normalizedApplication?.key]);
    if (!applicationId) {
      return;
    }
    compactApplications[applicationId] = normalizedApplication;
  });
  return compactApplications;
}

function normalizeCompactApplicationMap(applicationsById = null) {
  const normalizedApplications = {};
  if (!applicationsById || typeof applicationsById !== "object" || Array.isArray(applicationsById)) {
    return normalizedApplications;
  }

  Object.entries(applicationsById).forEach(([applicationId, application]) => {
    const normalizedApplication = normalizeCompactApplication({
      id: applicationId,
      ...(application && typeof application === "object" ? application : {})
    });
    const normalizedApplicationId = firstNonEmptyString([
      normalizedApplication?.id,
      normalizedApplication?.key
    ]);
    if (!normalizedApplicationId) {
      return;
    }
    normalizedApplications[normalizedApplicationId] = normalizedApplication;
  });
  return normalizedApplications;
}

function inflateCompactProgrammerVaultImportRecord(
  record = null,
  fallbackEnvironmentId = "",
  fallbackEnvironmentLabel = "",
  environmentRecord = null
) {
  if (!record || typeof record !== "object") {
    return record;
  }

  const normalizedRecord = cloneJsonLikeValue(record, {});
  const applicationsById = normalizeCompactApplicationMap(normalizedRecord.registeredApplicationsById);
  const hasCompactServicesShape = Object.values(
    normalizedRecord?.services && typeof normalizedRecord.services === "object" ? normalizedRecord.services : {}
  ).some((serviceRecord) => {
    return Boolean(
      firstNonEmptyString([
        serviceRecord?.registeredApplicationId
      ]) || Array.isArray(serviceRecord?.matchedTenantIds)
    );
  });
  if (Object.keys(applicationsById).length === 0 && !hasCompactServicesShape) {
    return {
      ...normalizedRecord,
      environmentId: firstNonEmptyString([normalizedRecord.environmentId, fallbackEnvironmentId]),
      environmentLabel: firstNonEmptyString([normalizedRecord.environmentLabel, fallbackEnvironmentLabel])
    };
  }

  return {
    ...normalizedRecord,
    environmentId: firstNonEmptyString([normalizedRecord.environmentId, fallbackEnvironmentId]),
    environmentLabel: firstNonEmptyString([normalizedRecord.environmentLabel, fallbackEnvironmentLabel]),
    selectedApplications: Object.values(applicationsById),
    services: inflateCompactProgrammerVaultServices(
      normalizedRecord.services,
      applicationsById,
      environmentRecord
    )
  };
}

function inflateCompactProgrammerVaultServices(services = null, applicationsById = {}, environmentRecord = null) {
  const inputServices = services && typeof services === "object" ? services : {};
  const inflatedServices = {};

  SUPPORTED_SERVICE_KEYS.forEach((serviceKey) => {
    const currentService = inputServices?.[serviceKey];
    if (serviceKey === "cm") {
      inflatedServices.cm = inflateCompactCmServiceRecord(currentService, environmentRecord);
      return;
    }

    inflatedServices[serviceKey] = inflateCompactDcrServiceRecord(currentService, applicationsById);
  });

  return inflatedServices;
}

function inflateCompactDcrServiceRecord(record = null, applicationsById = {}) {
  if (!record || typeof record !== "object") {
    return record;
  }

  const registeredApplicationId = firstNonEmptyString([record.registeredApplicationId]);
  return {
    ...cloneJsonLikeValue(record, {}),
    registeredApplication:
      normalizeCompactApplication(record.registeredApplication) ||
      cloneJsonLikeValue(applicationsById?.[registeredApplicationId], null)
  };
}

function inflateCompactCmServiceRecord(record = null, environmentRecord = null) {
  if (!record || typeof record !== "object") {
    return record;
  }

  return {
    ...cloneJsonLikeValue(record, {}),
    matchedTenants: inflateCompactMatchedTenants(record.matchedTenantIds, environmentRecord)
  };
}

function inflateCompactMatchedTenants(matchedTenantIds = [], environmentRecord = null) {
  const catalogTenants = Array.isArray(environmentRecord?.cmTenants?.tenants)
    ? environmentRecord.cmTenants.tenants
    : [];
  const catalogById = new Map(
    catalogTenants
      .map((tenant) => normalizeCompactTenant(tenant))
      .filter(Boolean)
      .flatMap((tenant) => {
        const identifiers = uniqueStrings([tenant?.id, tenant?.key]);
        return identifiers.map((identifier) => [identifier, tenant]);
      })
  );

  return uniqueStrings(matchedTenantIds).map((tenantId) => {
    const catalogMatch = catalogById.get(tenantId);
    if (catalogMatch) {
      return cloneJsonLikeValue(catalogMatch, null);
    }
    return {
      key: tenantId,
      id: tenantId,
      name: tenantId,
      label: tenantId
    };
  });
}

function countServiceClients(programmerRecords = []) {
  return (Array.isArray(programmerRecords) ? programmerRecords : []).reduce((total, record) => {
    return (
      total +
      SUPPORTED_SERVICE_KEYS.filter((serviceKey) => serviceKey !== "cm").reduce((serviceTotal, serviceKey) => {
        const client = record?.services?.[serviceKey]?.client;
        if (!client?.clientId || !client?.clientSecret) {
          return serviceTotal;
        }
        return serviceTotal + 1;
      }, 0)
    );
  }, 0);
}

function compareProgrammerRecords(left = null, right = null) {
  const leftEnvironment = String(left?.environmentLabel || left?.environmentId || "").trim();
  const rightEnvironment = String(right?.environmentLabel || right?.environmentId || "").trim();
  const environmentComparison = leftEnvironment.localeCompare(rightEnvironment, undefined, {
    sensitivity: "base"
  });
  if (environmentComparison !== 0) {
    return environmentComparison;
  }

  return String(left?.programmerLabel || left?.programmerName || left?.programmerId || "").localeCompare(
    String(right?.programmerLabel || right?.programmerName || right?.programmerId || ""),
    undefined,
    { sensitivity: "base" }
  );
}

function touchCacheEntry(cache, key, value, limit) {
  if (!key) {
    return;
  }
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, cloneJsonLikeValue(value, null));
  while (cache.size > limit) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
}

function computeExpiresAt(updatedAt = "", maxAgeMs = LOGINBUTTON_VAULT_PROGRAMMER_RECORD_TTL_MS) {
  const updatedAtMs = Date.parse(firstNonEmptyString([updatedAt]));
  if (!Number.isFinite(updatedAtMs) || updatedAtMs <= 0) {
    return "";
  }

  return new Date(updatedAtMs + maxAgeMs).toISOString();
}

function normalizePositiveInteger(values = []) {
  const candidates = Array.isArray(values) ? values : [values];
  for (const value of candidates) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue) && numberValue > 0) {
      return Math.floor(numberValue);
    }
  }
  return LOGINBUTTON_VAULT_PROGRAMMER_RECORD_TTL_MS;
}

function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function normalizeIdentifier(value = "") {
  return String(value || "").trim();
}

function firstNonEmptyString(values = []) {
  for (const value of Array.isArray(values) ? values : [values]) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function cloneJsonLikeValue(value, fallback = null) {
  if (value === undefined) {
    return fallback;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}
