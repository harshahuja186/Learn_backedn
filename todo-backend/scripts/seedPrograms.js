#!/usr/bin/env node
/**
 * Import / upsert OPM programs from CSV into the Program collection.
 *
 * JS port of scripts/edx-programs.js — no Mongoose schema; writes via
 * native collection API in batches of 500.
 *
 *   node scripts/seedPrograms.js \
 *     --csv="./src/data/OLRight - SIMPLILEARN.csv" --source=SIMPLILEARN
 *   node scripts/seedPrograms.js \
 *     --csv="./src/data/OLRight - SIMPLILEARN.csv" --source=SIMPLILEARN --execute
 *   node scripts/seedPrograms.js \
 *     --csv="./src/data/OLRight - SIMPLILEARN.csv" --source=SIMPLILEARN \
 *     --targets=dev,prod --batch-size=500 --execute
 */

"use strict";

const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const mongoose = require("mongoose");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const COLLECTION_PROGRAM = "Program";
const DEFAULT_SOURCE = "EDX";
const DEFAULT_PLATFORM = "OPM";
const DEFAULT_START_KEY = 91455;
const DEFAULT_KEY_CEILING = 200000;
const KEY_SCAN_MAX = 999999;
const DEFAULT_FX_RATE = 95.61;
const DEFAULT_BATCH_SIZE = 500;

const TARGET_ENV_KEYS = {
  dev: "MONGO_URI_DEV",
  auth: "MONGO_URI_AUTH",
  prod: "MONGO_URI_PROD",
};

const DURATION_UNIT_RE = "week|weeks|month|months|year|years|day|days";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
Import / upsert OPM programs from CSV into Program.

Supports EDX-style fee columns and COSMOSIQ/SIMPLILEARN-style tuition_cost columns.

Matching (update if found, else insert):
  1) CSV program_key
  2) url + name + source
  3) url + source
  4) uid + source

program_key generation (inserts only):
  Prefers free numeric keys starting at ${DEFAULT_START_KEY} across every
  --target DB. Skips keys already occupied in any target.

Options:
  --csv=<path>           CSV file path (required)
  --source=EDX|COSMOSIQ|SIMPLILEARN
                         Program.source written + used for matching
                         (default ${DEFAULT_SOURCE})
  --execute              Write documents (default: dry-run)
  --targets=dev,auth     DB targets (default: dev). Also: prod
  --batch-size=<n>       bulkWrite batch size (default ${DEFAULT_BATCH_SIZE})
  --audit-file=<path>    Write audit JSON report
  --start-key=<number>   Key floor for free-key search (default ${DEFAULT_START_KEY})
  --key-ceiling=<number> Reporting only: max key considered "in sequence"
                         (default ${DEFAULT_KEY_CEILING})
  --help                 Show this help

Env (per target):
  MONGO_URI_DEV / MONGO_URI_AUTH / MONGO_URI_PROD
  MONGO_URI / MONGODB_URI   Fallback when a target-specific URI is missing
`);
}

function parseArgs(argv) {
  const options = {
    csv: null,
    source: DEFAULT_SOURCE,
    execute: false,
    auditFile: null,
    startKey: null,
    keyCeiling: DEFAULT_KEY_CEILING,
    batchSize: DEFAULT_BATCH_SIZE,
    targets: ["dev"],
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--execute") options.execute = true;
    else if (arg.startsWith("--csv=")) options.csv = arg.slice("--csv=".length);
    else if (arg.startsWith("--source=")) {
      options.source = arg.slice("--source=".length).trim().toUpperCase();
    } else if (arg.startsWith("--audit-file=")) {
      options.auditFile = arg.slice("--audit-file=".length);
    } else if (arg.startsWith("--start-key=")) {
      options.startKey = Number(arg.slice("--start-key=".length));
    } else if (arg.startsWith("--key-ceiling=")) {
      options.keyCeiling = Number(arg.slice("--key-ceiling=".length));
    } else if (arg.startsWith("--batch-size=")) {
      options.batchSize = Number(arg.slice("--batch-size=".length));
    } else if (arg.startsWith("--targets=")) {
      options.targets = arg
        .slice("--targets=".length)
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    }
  }

  const csvIdx = argv.findIndex((a) => a === "--csv");
  if (csvIdx >= 0 && argv[csvIdx + 1] && !argv[csvIdx + 1].startsWith("-")) {
    options.csv = argv[csvIdx + 1];
  }

  return options;
}

function resolveTargetUri(target) {
  const envKey = TARGET_ENV_KEYS[target];
  if (!envKey) {
    throw new Error(
      `Unknown target "${target}". Use: ${Object.keys(TARGET_ENV_KEYS).join(", ")}`,
    );
  }

  const uri =
    process.env[envKey] ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      `Missing URI for target "${target}". Set ${envKey}, MONGO_URI, or MONGODB_URI in .env`,
    );
  }
  return uri;
}

// ---------------------------------------------------------------------------
// Parsers / helpers
// ---------------------------------------------------------------------------

function trimToNull(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function parseNumber(value) {
  const raw = trimToNull(value);
  if (!raw) return null;
  const match = raw.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function parsePositiveNumber(value) {
  const n = parseNumber(value);
  if (n === null || n <= 0) return null;
  return n;
}

function parseBool(value, fallback = true) {
  const raw = trimToNull(value);
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  if (["true", "1", "yes", "y"].includes(lower)) return true;
  if (["false", "0", "no", "n"].includes(lower)) return false;
  return fallback;
}

function toDate(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = trimToNull(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function weeksFromMonths(months) {
  return Math.round(months * (52 / 12));
}

function toWeeks(value, unit) {
  if (unit === "weeks") return Math.round(value);
  if (unit === "years") return Math.round(value * 52);
  if (unit === "days") return Math.max(1, Math.round(value / 7));
  return weeksFromMonths(value);
}

function firstRowValue(row, keys) {
  for (const key of keys) {
    const value = trimToNull(row[key]);
    if (value) return value;
  }
  return null;
}

function normalizeHeader(header) {
  return header
    .trim()
    .replace(/^fees\."fxRateToInr"$/, "fees.fxRateToInr")
    .replace(/^fees\."fxRateAt"$/, "fees.fxRateAt")
    .replace(/^opm\.fees\.""fxRateToInr""$/, "opm.fees.fxRateToInr")
    .replace(/^opm\.fees\.""fxRateAt""$/, "opm.fees.fxRateAt")
    .replace(/"+/g, '"')
    .replace(/^Number of courses$/i, "number_of_courses")
    .replace(/^Uid$/i, "uid");
}

function buildOpmDuration(durationText) {
  if (!durationText) return null;

  const parenRange = durationText.match(
    new RegExp(
      `\\((\\d+(?:\\.\\d+)?)\\s*[-–to]+\\s*(\\d+(?:\\.\\d+)?)\\s*(${DURATION_UNIT_RE})\\)`,
      "i",
    ),
  );
  const parenSingle = durationText.match(
    new RegExp(`\\((\\d+(?:\\.\\d+)?)\\s*(${DURATION_UNIT_RE})\\)`, "i"),
  );
  const range = durationText.match(
    new RegExp(
      `(\\d+(?:\\.\\d+)?)\\s*[-–to]+\\s*(\\d+(?:\\.\\d+)?)\\s*(${DURATION_UNIT_RE})\\b`,
      "i",
    ),
  );
  const single = durationText.match(
    new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${DURATION_UNIT_RE})\\b`, "i"),
  );

  const isRange = Boolean(parenRange || (!parenSingle && range));
  const hit = parenRange || parenSingle || range || single;
  if (!hit) {
    return {
      originalValue: durationText,
      valueInWeeks: 0,
      unitsToBeConverted: "unknown",
      minValue: 0,
      maxValue: 0,
      displayValue: durationText,
    };
  }

  const unitToken = (isRange ? hit[3] : hit[2]).toLowerCase();
  const unit = unitToken.startsWith("week")
    ? "weeks"
    : unitToken.startsWith("year")
      ? "years"
      : unitToken.startsWith("day")
        ? "days"
        : "months";

  const min = Number(hit[1]);
  const max = isRange ? Number(hit[2]) : min;
  const minWeeks = toWeeks(min, unit);
  const maxWeeks = toWeeks(max, unit);

  return {
    originalValue: durationText,
    valueInWeeks: maxWeeks,
    unitsToBeConverted: unit,
    minValue: minWeeks,
    maxValue: maxWeeks,
    displayValue:
      minWeeks === maxWeeks
        ? `${maxWeeks} weeks`
        : `${minWeeks}-${maxWeeks} weeks`,
  };
}

function buildDeadline(row) {
  const deadline =
    toDate(row["deadlines[0].deadline"]) ||
    toDate(row["opm.deadlines[0].deadline"]) ||
    toDate(row["deadlines[0].application_start_date"]) ||
    toDate(row["opm.deadlines[0].application_start_date"]) ||
    toDate(row["deadlines[0].admission_start"]) ||
    toDate(row["opm.deadlines[0].admission_start"]);

  if (!deadline) return null;

  const courseStart =
    toDate(row["deadlines[0].application_start_date"]) ||
    toDate(row["opm.deadlines[0].application_start_date"]) ||
    toDate(row["deadlines[0].admission_start"]) ||
    toDate(row["opm.deadlines[0].admission_start"]) ||
    null;

  // Always persist as BSON Date (never ISO strings).
  const intake =
    toDate(row["deadlines[0].intake"]) ||
    toDate(row["opm.deadlines[0].intake"]) ||
    null;

  return {
    intake,
    term: null,
    deadline,
    course_start_date: courseStart,
  };
}

function buildFees(row) {
  const baseValue = parseNumber(
    firstRowValue(row, ["fees.baseValue", "opm.fees.baseValue"]),
  );
  const amountInInrFromFees = parseNumber(
    firstRowValue(row, ["fees.amountInInr", "opm.fees.amountInInr"]),
  );
  const tuitionInr =
    parsePositiveNumber(row.tuition_cost) ?? parsePositiveNumber(row.total_cost);

  const amountInInr = amountInInrFromFees ?? tuitionInr;
  if (baseValue === null && amountInInr === null) return null;

  const explicitCurrency = firstRowValue(row, [
    "fees.currency",
    "opm.fees.currency",
  ]);
  const currency =
    explicitCurrency ||
    (baseValue === null && tuitionInr !== null ? "INR" : "USD");
  const fxRateToInr =
    parsePositiveNumber(
      firstRowValue(row, [
        "fees.fxRateToInr",
        'fees."fxRateToInr"',
        "opm.fees.fxRateToInr",
      ]),
    ) || (currency === "INR" ? 1 : DEFAULT_FX_RATE);
  const fxRateAt =
    toDate(
      firstRowValue(row, [
        "fees.fxRateAt",
        'fees."fxRateAt"',
        "opm.fees.fxRateAt",
      ]),
    ) || new Date();

  const resolvedBase =
    baseValue !== null
      ? baseValue
      : amountInInr !== null
        ? Number((amountInInr / fxRateToInr).toFixed(2))
        : 0;
  const resolvedInr =
    amountInInr !== null
      ? amountInInr
      : Number((resolvedBase * fxRateToInr).toFixed(0));

  return {
    baseValue: resolvedBase,
    currency,
    amountInInr: resolvedInr,
    fxRateToInr,
    fxRateAt,
  };
}

function collectIndexedField(row, prefix, suffix) {
  const values = [];
  for (const [key, value] of Object.entries(row)) {
    if (!key.startsWith(`${prefix}[`) || !key.endsWith(`].${suffix}`)) continue;
    const v = trimToNull(value);
    if (v) values.push(v);
  }
  return [...new Set(values)];
}

function parseLanguages(value) {
  const raw = trimToNull(value);
  if (!raw) return undefined;
  const parts = raw
    .split(/\s*\+\s*|\s*,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

function mapRowToProgram(row, programKey, defaultSource) {
  const now = new Date();
  const source = defaultSource.toUpperCase();
  const platform =
    trimToNull(row["platforms[0]"]) ||
    trimToNull(row.platforms) ||
    DEFAULT_PLATFORM;
  const durationText =
    trimToNull(row.duration) ||
    trimToNull(row["opm.duration.orignalValue"]) ||
    trimToNull(row["opm.duration.originalValue"]);
  const workload = trimToNull(row.workload);
  const url = trimToNull(row.url);
  const admissionUrl = trimToNull(row.admission_url) ?? url;
  const universityName = firstRowValue(row, [
    "universityData.name",
    "universityData.universityName",
    "university_name",
  ]);
  const universityLogo = trimToNull(row["universityData.logo"]);
  const universityNameAlt = trimToNull(row["universityData.universityName"]);
  const universityCountry = trimToNull(row["universityData.country"]);
  const imageUrl = trimToNull(row["universityData.image_urls[0]"]);
  const pace = trimToNull(row.pace);
  const modeOfLearning =
    trimToNull(row.modeOfLearning) || trimToNull(row.delivery_mode);
  const numberOfCourses = parsePositiveNumber(
    firstRowValue(row, ["number_of_courses", "Number of courses"]),
  );
  const courseDuration = parsePositiveNumber(row.course_duration);
  const uid = firstRowValue(row, ["uid", "Uid"]);
  const deadline = buildDeadline(row);
  const fees = buildFees(row);
  const opmDuration = buildOpmDuration(durationText);

  const createdDate = toDate(row.created_date) || now;
  const updatedDate = toDate(row.updated_date) || now;

  const doc = {
    program_key: programKey,
    source_program_key: trimToNull(row.program_key),
    uid,
    name: trimToNull(row.name) ?? "",
    degree: trimToNull(row.degree),
    type: trimToNull(row.type),
    source,
    platforms: [platform],
    active: parseBool(row.active, true),
    created_date: createdDate,
    updated_date: updatedDate,
    deadlines: deadline ? [deadline] : [],
    opm: {},
    deletedAt: null,
  };

  const completeName = trimToNull(row.complete_name);
  if (completeName) doc.complete_name = completeName;
  if (durationText) doc.duration = durationText;
  if (workload) doc.workload = workload;
  if (modeOfLearning) doc.delivery_mode = modeOfLearning;
  else if (pace) doc.delivery_mode = pace;
  if (admissionUrl) doc.admission_url = admissionUrl;
  if (url) doc.url = url;
  if (imageUrl) doc.image_urls = [imageUrl];
  if (courseDuration !== null) doc.course_duration = courseDuration;

  const languages = parseLanguages(row.language || row.languages);
  if (languages) doc.languages = languages;

  if (universityName || universityLogo || universityNameAlt || universityCountry) {
    doc.university_name = universityName ?? universityNameAlt ?? undefined;
    doc.universityData = {};
    if (universityName) doc.universityData.name = universityName;
    else if (universityNameAlt) doc.universityData.name = universityNameAlt;
    if (universityLogo) doc.universityData.logo = universityLogo;
    if (universityNameAlt) doc.universityData.universityName = universityNameAlt;
    if (universityCountry) doc.universityData.country = universityCountry;
  }

  const aosNames = collectIndexedField(row, "aos", "aos_name");
  if (aosNames.length) doc.aos = aosNames.map((aos_name) => ({ aos_name }));

  const specs = collectIndexedField(row, "course_specialization", "name");
  if (specs.length) doc.course_specialization = specs.map((name) => ({ name }));

  if (opmDuration) doc.opm.duration = opmDuration;
  if (fees) {
    doc.opm.fees = fees;
    doc.opm.currency = fees.currency;
    doc.opm.tuition_cost = fees.baseValue;
    doc.tuition_cost = Math.round(fees.amountInInr);
    doc.total_cost = Math.round(
      parsePositiveNumber(row.total_cost) ?? fees.amountInInr,
    );
  }
  if (pace) doc.opm.pace = pace;
  if (modeOfLearning) doc.opm.mode_of_learning = modeOfLearning;
  if (numberOfCourses !== null) doc.opm.number_of_courses = numberOfCourses;

  const rating = parseNumber(row.rating);
  if (rating !== null) doc.opm.rating = rating;
  const reviewsCount = trimToNull(row.reviewsCount);
  if (reviewsCount) doc.opm.reviews_count = reviewsCount;
  const studentEnrolled = trimToNull(row.studentEnrolled);
  if (studentEnrolled) doc.opm.student_enrolled = studentEnrolled;
  const contentHours = trimToNull(row.contentHours);
  if (contentHours) doc.opm.content_hours = contentHours;
  const structureTotal = trimToNull(row.structureTotal);
  if (structureTotal) doc.opm.structure_total = structureTotal;
  const handsOnProjects = trimToNull(row.handsOnProjects);
  if (handsOnProjects) doc.opm.hands_on_projects = handsOnProjects;
  const level = trimToNull(row.level);
  if (level) doc.opm.level = level;
  const placement = trimToNull(row.placement);
  if (placement) doc.opm.placement = placement;

  return doc;
}

function buildUpdateSet(document) {
  // Keep program_key stable on match; rewrite every other field including
  // date fields as real BSON Dates (fixes prior ISO-string writes).
  const { program_key: _programKey, ...rest } = document;
  return {
    ...rest,
    updated_date: new Date(),
  };
}

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv({ mapHeaders: ({ header }) => normalizeHeader(header) }))
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

async function connect(uri) {
  const connection = mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 30000,
  });
  await connection.asPromise();
  return connection;
}

function extractNumericProgramKey(value) {
  const raw = trimToNull(value);
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function loadOccupiedProgramKeys(collection) {
  const docs = await collection
    .find(
      { program_key: { $regex: /^\d{1,6}$/ } },
      { projection: { program_key: 1 } },
    )
    .toArray();

  const occupied = new Set();
  for (const doc of docs) {
    const n = extractNumericProgramKey(doc.program_key);
    if (n !== null && n >= 1 && n <= KEY_SCAN_MAX) occupied.add(n);
  }
  return occupied;
}

function maxKeyAtOrBelow(keys, ceiling) {
  let max = 0;
  for (const key of keys) {
    if (key <= ceiling && key > max) max = key;
  }
  return max;
}

function resolveInsertStartKey(occupiedAcrossTargets, startKeyFloor) {
  let candidate = startKeyFloor;
  while (occupiedAcrossTargets.has(candidate) && candidate <= KEY_SCAN_MAX) {
    candidate += 1;
  }
  if (candidate > KEY_SCAN_MAX) {
    throw new Error(
      `No free program_key available from floor ${startKeyFloor} before ${KEY_SCAN_MAX}`,
    );
  }
  return candidate;
}

function allocateNextFreeKeys(count, startFrom, occupied) {
  const keys = [];
  let candidate = startFrom;
  while (keys.length < count) {
    if (!occupied.has(candidate)) {
      keys.push(candidate);
      occupied.add(candidate);
    }
    candidate += 1;
    if (candidate > KEY_SCAN_MAX) {
      throw new Error(
        `Ran out of free program_keys before ${KEY_SCAN_MAX} while allocating ${count} keys from ${startFrom}`,
      );
    }
  }
  return keys;
}

async function loadExistingSourcePrograms(collection, source) {
  const docs = await collection
    .find({ source }, { projection: { program_key: 1, uid: 1, url: 1, name: 1 } })
    .toArray();

  return docs
    .map((doc) => {
      const n = extractNumericProgramKey(doc.program_key);
      const programKey = n !== null ? String(n) : trimToNull(doc.program_key);
      if (!programKey) return null;
      return {
        program_key: programKey,
        uid: trimToNull(doc.uid),
        url: trimToNull(doc.url),
        name: trimToNull(doc.name),
      };
    })
    .filter(Boolean);
}

function buildExistingIndexes(programs) {
  const byKey = new Map();
  const byUrlName = new Map();
  const byUrl = new Map();
  const byUid = new Map();

  for (const program of programs) {
    byKey.set(program.program_key, program);
    if (program.url && program.name) {
      byUrlName.set(`${program.url}::${program.name}`, program);
    }
    if (program.url) byUrl.set(program.url, program);
    if (program.uid) byUid.set(program.uid, program);
  }

  return { byKey, byUrlName, byUrl, byUid };
}

function matchExistingProgram(row, indexes) {
  const csvKey = trimToNull(row.program_key);
  if (csvKey) {
    const hit = indexes.byKey.get(csvKey);
    if (hit) return { program: hit, matchBy: "program_key" };
  }

  const url = trimToNull(row.url);
  const name = trimToNull(row.name);
  if (url && name) {
    const hit = indexes.byUrlName.get(`${url}::${name}`);
    if (hit) return { program: hit, matchBy: "url+name" };
  }

  if (url) {
    const hit = indexes.byUrl.get(url);
    if (hit) return { program: hit, matchBy: "url" };
  }

  const uid = firstRowValue(row, ["uid", "Uid"]);
  if (uid) {
    const hit = indexes.byUid.get(uid);
    if (hit) return { program: hit, matchBy: "uid" };
  }

  return null;
}

function chunk(items, size) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

function defaultAuditPath(source) {
  const slug = source.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return path.join(
    process.cwd(),
    "output",
    "reports",
    `import-${slug}-programs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
}

function defaultKeysTrackPath(auditPath) {
  const dir = path.dirname(auditPath);
  const base = path.basename(auditPath, path.extname(auditPath));
  return path.join(dir, `${base}.program-keys.csv`);
}

function writeProgramKeysCsv(filePath, assignments) {
  const header = "program_key,uid,name,action,match_by,url,row\n";
  const escape = (value) => {
    const raw = value ?? "";
    if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
    return raw;
  };
  const lines = assignments.map((a) =>
    [
      a.program_key,
      escape(a.uid),
      escape(a.name),
      a.action,
      escape(a.match_by),
      escape(a.url),
      String(a.row),
    ].join(","),
  );
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${header}${lines.join("\n")}\n`, "utf8");
}

function incrementSkip(counts, reason) {
  counts[reason] = (counts[reason] || 0) + 1;
}

/**
 * Build bulkWrite ops for one batch and apply them.
 * Returns per-row outcomes so the caller can update audit + local indexes.
 */
async function writeBatch(collection, plannedBatch, indexes, target) {
  const prepared = plannedBatch.map((planned) => {
    const localMatch = matchExistingProgram(
      {
        program_key: planned.document.program_key,
        url: planned.document.url,
        name: planned.document.name,
        uid: planned.document.uid ?? undefined,
      },
      indexes,
    );

    if (localMatch) {
      return {
        planned,
        action: "update",
        matchBy: localMatch.matchBy,
        programKey: localMatch.program.program_key,
        op: {
          updateOne: {
            filter: {
              $or: [
                { program_key: localMatch.program.program_key },
                { program_key: Number(localMatch.program.program_key) },
              ],
            },
            update: {
              $set: buildUpdateSet({
                ...planned.document,
                program_key: localMatch.program.program_key,
              }),
            },
          },
        },
      };
    }

    return {
      planned,
      action: "insert",
      matchBy: null,
      programKey: planned.program_key,
      op: {
        insertOne: {
          document: { ...planned.document },
        },
      },
    };
  });

  const ops = prepared.map((p) => p.op);
  const failedIndexes = new Set();

  try {
    await collection.bulkWrite(ops, { ordered: false });
  } catch (err) {
    const writeErrors = err?.writeErrors || err?.result?.getWriteErrors?.() || [];
    for (const writeError of writeErrors) {
      const idx =
        typeof writeError.index === "number"
          ? writeError.index
          : writeError.err?.index;
      if (typeof idx === "number") failedIndexes.add(idx);
    }

    // If the driver didn't attach writeErrors, treat the whole batch as failed.
    if (failedIndexes.size === 0) {
      return prepared.map((item) => ({
        ...item,
        ok: false,
        error: `[${target}] ${err instanceof Error ? err.message : String(err)}`,
      }));
    }
  }

  return prepared.map((item, index) => {
    if (failedIndexes.has(index)) {
      return {
        ...item,
        ok: false,
        error: `[${target}] bulkWrite op failed at index ${index}`,
      };
    }
    return { ...item, ok: true, error: null };
  });
}

function rememberInserted(indexes, document) {
  const program = {
    program_key: String(document.program_key),
    uid: trimToNull(document.uid),
    url: trimToNull(document.url),
    name: trimToNull(document.name),
  };
  indexes.byKey.set(program.program_key, program);
  if (program.url && program.name) {
    indexes.byUrlName.set(`${program.url}::${program.name}`, program);
  }
  if (program.url) indexes.byUrl.set(program.url, program);
  if (program.uid) indexes.byUid.set(program.uid, program);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (!options.csv) {
    console.error("Error: --csv=<path> is required");
    printHelp();
    process.exit(1);
  }

  if (
    options.startKey !== null &&
    (!Number.isFinite(options.startKey) || options.startKey < 1)
  ) {
    console.error("Error: --start-key must be a positive number");
    process.exit(1);
  }

  if (!Number.isFinite(options.keyCeiling) || options.keyCeiling < 1) {
    console.error("Error: --key-ceiling must be a positive number");
    process.exit(1);
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    console.error("Error: --batch-size must be a positive integer");
    process.exit(1);
  }

  if (options.targets.length === 0) {
    console.error("Error: --targets must include at least one of: dev, auth, prod");
    process.exit(1);
  }

  const csvPath = path.resolve(options.csv);
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  const dryRun = !options.execute;
  const keyFloor = options.startKey ?? DEFAULT_START_KEY;

  console.log(`Reading ${csvPath}`);
  const rows = await readCsv(csvPath);
  console.log(`Parsed ${rows.length} CSV rows`);
  console.log(`Source: ${options.source}`);
  console.log(
    dryRun ? "Mode: dry-run (pass --execute to write)" : "Mode: execute (upsert)",
  );
  console.log(`Targets: ${options.targets.join(", ")}`);
  console.log(`Batch size: ${options.batchSize}`);
  console.log(
    `program_key: prefer free keys from ${keyFloor} across targets` +
      ` (key-ceiling=${options.keyCeiling} for reporting)`,
  );

  const audit = {
    csv: csvPath,
    source: options.source,
    dry_run: dryRun,
    execute: options.execute,
    targets: options.targets,
    batch_size: options.batchSize,
    start_key: keyFloor,
    generated_key_from: 0,
    generated_key_to: null,
    next_available_key: 0,
    key_ceiling: options.keyCeiling,
    max_key_by_target: {},
    max_key_for_next_by_target: {},
    summary: {
      total_rows: rows.length,
      planned: 0,
      to_insert: 0,
      to_update: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      skipped_by_reason: {},
      program_keys: {
        assigned_count: 0,
        insert_count: 0,
        update_count: 0,
        insert_key_from: null,
        insert_key_to: null,
        insert_keys: [],
        update_keys: [],
      },
    },
    program_key_assignments: [],
    planned: [],
    inserted: [],
    updated: [],
    skipped: [],
    failed: [],
    by_target: {},
  };

  const connections = new Map();
  const collections = new Map();
  const indexesByTarget = new Map();

  try {
    const occupiedAcrossTargets = new Set();

    for (const target of options.targets) {
      const uri = resolveTargetUri(target);
      console.log(`Connecting target=${target}...`);
      const connection = await connect(uri);
      connections.set(target, connection);
      const collection = connection.collection(COLLECTION_PROGRAM);
      collections.set(target, collection);

      const occupied = await loadOccupiedProgramKeys(collection);
      const maxAll = occupied.size ? Math.max(...occupied) : 0;
      const maxForNext = maxKeyAtOrBelow(occupied, options.keyCeiling);
      audit.max_key_by_target[target] = maxAll;
      audit.max_key_for_next_by_target[target] = maxForNext;
      for (const key of occupied) occupiedAcrossTargets.add(key);

      const existing = await loadExistingSourcePrograms(collection, options.source);
      indexesByTarget.set(target, buildExistingIndexes(existing));
      console.log(
        `  ${target}: ${options.source} programs=${existing.length}, occupied_keys=${occupied.size}` +
          `, max=${maxAll}, max_for_next(<=${options.keyCeiling})=${maxForNext}`,
      );
      audit.by_target[target] = {
        inserted: 0,
        updated: 0,
        failed: 0,
        samples: [],
      };
    }

    const nextAvailable = resolveInsertStartKey(occupiedAcrossTargets, keyFloor);
    const maxForNext = maxKeyAtOrBelow(occupiedAcrossTargets, options.keyCeiling);
    audit.next_available_key = nextAvailable;
    console.log(
      `First free program_key from ${keyFloor} across [${options.targets.join(", ")}]: ${nextAvailable}` +
        ` (max_occupied_for_report=${maxForNext}, ceiling=${options.keyCeiling})`,
    );

    const primaryTarget = options.targets[0];
    const primaryIndexes = indexesByTarget.get(primaryTarget);

    const tentatives = [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const rowNum = i + 2;
      const name = trimToNull(row.name);
      const uid = firstRowValue(row, ["uid", "Uid"]);

      if (!name) {
        audit.summary.skipped += 1;
        incrementSkip(audit.summary.skipped_by_reason, "missing_name");
        audit.skipped.push({ row: rowNum, reason: "missing_name", uid });
        continue;
      }

      if (!trimToNull(row.url)) {
        audit.summary.skipped += 1;
        incrementSkip(audit.summary.skipped_by_reason, "missing_url");
        audit.skipped.push({ row: rowNum, reason: "missing_url", uid, name });
        continue;
      }

      const match = matchExistingProgram(row, primaryIndexes);
      tentatives.push({
        rowIndex: i,
        rowNum,
        row,
        name,
        uid,
        action: match ? "update" : "insert",
        matchBy: match?.matchBy ?? null,
        existingKey: match?.program.program_key ?? null,
      });
    }

    const insertCount = tentatives.filter((t) => t.action === "insert").length;
    const freeKeys = allocateNextFreeKeys(
      insertCount,
      nextAvailable,
      occupiedAcrossTargets,
    );
    audit.generated_key_from = freeKeys[0] ?? nextAvailable;
    audit.generated_key_to = freeKeys.length
      ? freeKeys[freeKeys.length - 1]
      : null;

    let insertAlloc = 0;
    const plannedRows = [];

    for (const tentative of tentatives) {
      const programKey =
        tentative.action === "update"
          ? tentative.existingKey
          : String(freeKeys[insertAlloc++]);

      const document = mapRowToProgram(
        tentative.row,
        programKey,
        options.source,
      );
      plannedRows.push({
        row: tentative.rowNum,
        action: tentative.action,
        match_by: tentative.matchBy,
        program_key: programKey,
        source_program_key: trimToNull(tentative.row.program_key),
        uid: tentative.uid,
        name: tentative.name,
        document,
      });

      audit.planned.push({
        row: tentative.rowNum,
        action: tentative.action,
        match_by: tentative.matchBy,
        program_key: programKey,
        source_program_key: trimToNull(tentative.row.program_key),
        uid: tentative.uid,
        name: tentative.name,
      });

      audit.program_key_assignments.push({
        row: tentative.rowNum,
        action: tentative.action,
        program_key: programKey,
        uid: tentative.uid,
        name: tentative.name,
        url: trimToNull(tentative.row.url),
        match_by: tentative.matchBy,
      });
    }

    const insertKeys = plannedRows
      .filter((p) => p.action === "insert")
      .map((p) => p.program_key);
    const updateKeys = plannedRows
      .filter((p) => p.action === "update")
      .map((p) => p.program_key);

    audit.summary.planned = plannedRows.length;
    audit.summary.to_insert = insertKeys.length;
    audit.summary.to_update = updateKeys.length;
    audit.summary.program_keys = {
      assigned_count: plannedRows.length,
      insert_count: insertKeys.length,
      update_count: updateKeys.length,
      insert_key_from: insertKeys.length ? Number(insertKeys[0]) : null,
      insert_key_to: insertKeys.length
        ? Number(insertKeys[insertKeys.length - 1])
        : null,
      insert_keys: insertKeys,
      update_keys: updateKeys,
    };

    console.log(
      `Prepared ${plannedRows.length} programs` +
        ` (insert=${audit.summary.to_insert}, update=${audit.summary.to_update},` +
        ` skipped=${audit.summary.skipped}` +
        (insertKeys.length
          ? `, new keys ${insertKeys[0]}–${insertKeys[insertKeys.length - 1]}`
          : "") +
        `)`,
    );

    if (plannedRows[0]) {
      console.log("\nSample mapped document:");
      console.log(
        JSON.stringify(
          plannedRows[0].document,
          (_k, v) => (v instanceof Date ? v.toISOString() : v),
          2,
        ),
      );
    }

    if (!dryRun && plannedRows.length > 0) {
      const failedRows = new Set();

      for (const target of options.targets) {
        const collection = collections.get(target);
        const indexes = indexesByTarget.get(target);
        const batches = chunk(plannedRows, options.batchSize);

        console.log(
          `\nWriting into ${COLLECTION_PROGRAM} (${target})` +
            ` in ${batches.length} batch(es) of <=${options.batchSize}...`,
        );

        for (let b = 0; b < batches.length; b += 1) {
          const batch = batches[b];
          const outcomes = await writeBatch(
            collection,
            batch,
            indexes,
            target,
          );

          let batchInserted = 0;
          let batchUpdated = 0;
          let batchFailed = 0;

          for (const outcome of outcomes) {
            if (!outcome.ok) {
              batchFailed += 1;
              audit.by_target[target].failed += 1;
              audit.summary.failed += 1;
              failedRows.add(outcome.planned.row);
              audit.failed.push({
                row: outcome.planned.row,
                action: outcome.planned.action,
                program_key: outcome.planned.program_key,
                source_program_key: outcome.planned.source_program_key,
                uid: outcome.planned.uid,
                name: outcome.planned.name,
                error: outcome.error,
              });
              continue;
            }

            if (outcome.action === "insert") {
              batchInserted += 1;
              audit.by_target[target].inserted += 1;
              rememberInserted(indexes, outcome.planned.document);
            } else {
              batchUpdated += 1;
              audit.by_target[target].updated += 1;
            }

            if (audit.by_target[target].samples.length < 5) {
              audit.by_target[target].samples.push({
                row: outcome.planned.row,
                action: outcome.action,
                match_by: outcome.matchBy,
                program_key: outcome.programKey,
                name: outcome.planned.name,
              });
            }
          }

          console.log(
            `  batch ${b + 1}/${batches.length}: size=${batch.length}` +
              ` inserted=${batchInserted} updated=${batchUpdated} failed=${batchFailed}`,
          );
        }
      }

      for (const planned of plannedRows) {
        if (failedRows.has(planned.row)) continue;
        if (planned.action === "insert") {
          audit.summary.inserted += 1;
          audit.inserted.push({
            row: planned.row,
            action: "insert",
            program_key: planned.program_key,
            uid: planned.uid,
            name: planned.name,
          });
        } else {
          audit.summary.updated += 1;
          audit.updated.push({
            row: planned.row,
            action: "update",
            match_by: planned.match_by,
            program_key: planned.program_key,
            uid: planned.uid,
            name: planned.name,
          });
        }
      }
    }
  } finally {
    for (const [target, connection] of connections) {
      await connection.close();
      console.log(`Closed ${target}`);
    }
  }

  const auditPath = path.resolve(
    options.auditFile || defaultAuditPath(options.source),
  );
  fs.mkdirSync(path.dirname(auditPath), { recursive: true });
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2));

  const keysTrackPath = defaultKeysTrackPath(auditPath);
  writeProgramKeysCsv(keysTrackPath, audit.program_key_assignments);

  const pk = audit.summary.program_keys;
  console.log("\nSummary");
  console.log(`  total_rows:   ${audit.summary.total_rows}`);
  console.log(`  planned:      ${audit.summary.planned}`);
  console.log(`  to_insert:    ${audit.summary.to_insert}`);
  console.log(`  to_update:    ${audit.summary.to_update}`);
  console.log(`  inserted:     ${audit.summary.inserted}`);
  console.log(`  updated:      ${audit.summary.updated}`);
  console.log(`  skipped:      ${audit.summary.skipped}`);
  console.log(`  failed:       ${audit.summary.failed}`);
  console.log(`  program_keys: assigned=${pk.assigned_count}`);
  console.log(`               next_available_was=${audit.next_available_key}`);
  if (pk.insert_count > 0) {
    console.log(
      `               inserts=${pk.insert_count} range=${pk.insert_key_from}–${pk.insert_key_to}`,
    );
  }
  if (pk.update_count > 0) {
    console.log(`               updates=${pk.update_count}`);
  }
  console.log(`  max_by_target:${JSON.stringify(audit.max_key_by_target)}`);
  console.log(
    `  max_for_next_by_target:${JSON.stringify(audit.max_key_for_next_by_target)}`,
  );
  if (Object.keys(audit.summary.skipped_by_reason).length > 0) {
    console.log(
      `  skip_reasons: ${JSON.stringify(audit.summary.skipped_by_reason)}`,
    );
  }
  console.log(`\nAudit written to ${auditPath}`);
  console.log(`program_key track CSV: ${keysTrackPath}`);

  if (audit.summary.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
