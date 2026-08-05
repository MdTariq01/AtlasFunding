/**
 * AtlasFunding — Scholarship Cleanup Script
 *
 * Removes scholarships that have expired (deadline passed by > 7 days)
 * and also cleans up orphaned Match records for deleted scholarships.
 *
 * Usage:
 *   node scripts/cleanup.js             — Run cleanup manually
 *   node scripts/cleanup.js --dry-run   — Preview what would be deleted without actually deleting
 */
require("dotenv").config();
const connectDB = require("../src/db/connection");
const Scholarship = require("../src/models/Scholarship");
const Match = require("../src/models/Match");
const Timeline = require("../src/models/Timeline");

const isDryRun = process.argv.includes("--dry-run");

async function runCleanup() {
  await connectDB();

  const now = new Date();

  // Grace period: only remove scholarships whose deadline passed 7+ days ago
  // This gives students time to see "recently expired" ones and not miss any
  const gracePeriodDays = 7;
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - gracePeriodDays);
  const cutoffStr = cutoffDate.toISOString().split("T")[0]; // YYYY-MM-DD

  console.log("\n🧹 AtlasFunding — Scholarship Cleanup Job");
  console.log("─".repeat(52));
  console.log(`📅 Today:    ${now.toISOString().split("T")[0]}`);
  console.log(`📅 Cutoff:   ${cutoffStr} (removing deadlines before this date)`);
  console.log(`🔍 Mode:     ${isDryRun ? "DRY RUN — no changes will be made" : "LIVE — changes will be committed"}`);
  console.log("─".repeat(52) + "\n");

  // Find all scholarships with a deadline older than the cutoff
  const expired = await Scholarship.find({
    deadline: {
      $ne: null,
      $exists: true,
      $lt: cutoffStr, // String comparison works for YYYY-MM-DD format
    },
  }).lean();

  // Also find scholarships with null/missing deadlines that were never verified
  // and are older than 90 days (likely stale placeholder entries)
  const staleUnverified = await Scholarship.find({
    verified: false,
    deadline: null,
    createdAt: { $lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) },
  }).lean();

  const allToDelete = [...expired, ...staleUnverified];

  if (allToDelete.length === 0) {
    console.log("✅ No expired or stale scholarships found. Database is clean!\n");
    const total = await Scholarship.countDocuments();
    console.log(`📊 Active scholarships in DB: ${total}\n`);
    return { deleted: 0, matchesDeleted: 0 };
  }

  console.log(`Found ${expired.length} expired scholarships (deadline passed ${gracePeriodDays}+ days ago):`);
  expired.forEach((s) => {
    console.log(`  🗑️  [EXPIRED]  "${s.name}" — deadline: ${s.deadline}`);
  });

  if (staleUnverified.length > 0) {
    console.log(`\nFound ${staleUnverified.length} stale unverified scholarships (90+ days old, no deadline):`);
    staleUnverified.forEach((s) => {
      console.log(`  🗑️  [STALE]    "${s.name}" — created: ${s.createdAt?.toISOString().split("T")[0]}`);
    });
  }

  if (isDryRun) {
    console.log("\n⚠️  DRY RUN: No changes made. Remove --dry-run flag to apply.\n");
    return { deleted: 0, matchesDeleted: 0 };
  }

  // Delete the scholarships
  const scholarshipIds = allToDelete.map((s) => s._id);
  const { deletedCount: deletedScholarships } = await Scholarship.deleteMany({
    _id: { $in: scholarshipIds },
  });

  // Clean up orphaned Match records for deleted scholarships
  const { deletedCount: deletedMatches } = await Match.deleteMany({
    scholarship_id: { $in: scholarshipIds },
  });

  // Clean up orphaned Timeline entries
  const { deletedCount: deletedTimelines } = await Timeline.deleteMany({
    scholarship_id: { $in: scholarshipIds },
  });

  const remaining = await Scholarship.countDocuments();

  console.log("\n─".repeat(52));
  console.log(`✅ Cleanup complete!`);
  console.log(`   🗑️  Scholarships deleted:  ${deletedScholarships}`);
  console.log(`   🗑️  Match records deleted:  ${deletedMatches}`);
  console.log(`   🗑️  Timeline entries deleted: ${deletedTimelines}`);
  console.log(`   📊  Remaining active scholarships: ${remaining}\n`);

  return { deleted: deletedScholarships, matchesDeleted: deletedMatches };
}

// CLI entry point
if (require.main === module) {
  runCleanup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Cleanup failed:", err.message);
      process.exit(1);
    });
}

module.exports = { runCleanup };
