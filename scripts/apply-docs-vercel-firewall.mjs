#!/usr/bin/env node

const DEFAULT_PROJECT_ID = "prj_ppjxvoIGcoV3jGTeq8vBhzObXaJV";
const DEFAULT_TEAM_ID = "team_eu3qF8T1G0150GL2tqHOrG6Q";
const RULE_NAME = "Block common non-doc 404 probes";

const RULE_VALUE = {
  active: true,
  name: RULE_NAME,
  description:
    "Deny high-volume crawler probes for non-doc marketing paths that collapse into the docs /404.html route.",
  conditionGroup: [
    {
      conditions: [
        {
          type: "path",
          op: "re",
          neg: false,
          value: "^/(about|contact|home)/?$",
        },
      ],
    },
  ],
  action: {
    mitigate: {
      action: "deny",
      rateLimit: null,
      redirect: null,
      actionDuration: null,
    },
  },
};

function parseArgs(argv) {
  const options = {
    dryRun: false,
    projectId: process.env.VERCEL_PROJECT_ID || DEFAULT_PROJECT_ID,
    teamId: process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID || DEFAULT_TEAM_ID,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--project-id") {
      options.projectId = argv[++i];
      continue;
    }
    if (arg === "--team-id") {
      options.teamId = argv[++i];
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.projectId) throw new Error("Missing Vercel project id");
  if (!options.teamId) throw new Error("Missing Vercel team id");
  return options;
}

function findRuleByName(value, name) {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findRuleByName(item, name);
      if (match) return match;
    }
    return null;
  }

  if (value.name === name && (value.id || value.uid)) {
    return value;
  }

  for (const child of Object.values(value)) {
    const match = findRuleByName(child, name);
    if (match) return match;
  }

  return null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = process.env.VERCEL_TOKEN;
  if (!token && !options.dryRun) {
    throw new Error("VERCEL_TOKEN is required unless --dry-run is set");
  }

  console.log(`Rule: ${RULE_NAME}`);
  console.log(`Project: ${options.projectId}`);
  console.log(`Team: ${options.teamId}`);
  console.log(JSON.stringify(RULE_VALUE, null, 2));

  if (options.dryRun) {
    console.log("Dry run only; no Vercel API calls were made.");
    return;
  }

  const { Vercel } = await import("@vercel/sdk");
  const vercel = new Vercel({ bearerToken: token });
  const config = await vercel.security.getFirewallConfig({
    configVersion: "active",
    projectId: options.projectId,
    teamId: options.teamId,
  });
  const existingRule = findRuleByName(config, RULE_NAME);

  if (existingRule) {
    const id = existingRule.id || existingRule.uid;
    await vercel.security.updateFirewallConfig({
      action: "rules.update",
      id,
      projectId: options.projectId,
      teamId: options.teamId,
      value: RULE_VALUE,
    });
    console.log(`Updated existing firewall rule ${id}.`);
    return;
  }

  await vercel.security.updateFirewallConfig({
    action: "rules.insert",
    id: null,
    projectId: options.projectId,
    teamId: options.teamId,
    value: RULE_VALUE,
  });
  console.log("Inserted firewall rule.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
