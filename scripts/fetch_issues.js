const https = require("https");
const fs = require("fs");
const path = require("path");

const OWNER = process.env.GITHUB_REPOSITORY.split("/")[0];
const REPO = process.env.GITHUB_REPOSITORY.split("/")[1];
const TOKEN = process.env.GITHUB_TOKEN;

const DATA_DIR = "data";
const PLAYERS_DIR = path.join(DATA_DIR, "players");
const RACES_DIR = path.join(DATA_DIR, "races");
const REGIONS_DIR = path.join(DATA_DIR, "regions");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function fetchIssues() {
  const options = {
    hostname: "api.github.com",
    path: `/repos/${OWNER}/${REPO}/issues?state=open&per_page=100`,
    headers: {
      "User-Agent": "battle-rank-system",
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json"
    }
  };

  return new Promise((resolve, reject) => {
    https
      .get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const result = JSON.parse(data);

            if (!Array.isArray(result)) {
              console.error("❌ GitHub API response is not an array:");
              console.error(result);
              reject(
                new Error(
                  result.message || "GitHub Issues API returned invalid data"
                )
              );
              return;
            }

            resolve(result);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}


function emptyStats() {
  return { total: 0, wins: 0, losses: 0, winRate: 0 };
}

function calcWinRate(stat) {
  stat.winRate =
    stat.total === 0 ? 0 : +(stat.wins / stat.total).toFixed(3);
}

(async function main() {
  ensureDir(DATA_DIR);
  ensureDir(PLAYERS_DIR);
  ensureDir(RACES_DIR);
  ensureDir(REGIONS_DIR);

  const issues = await fetchIssues();

  const players = {};
  const races = {};
  const regions = {};
  const leaderboard = [];

  for (const issue of issues) {
    if (!issue.body) continue;

    let match;
    try {
      match = JSON.parse(issue.body);
    } catch {
      continue;
    }

    const {
      playerA,
      playerB,
      raceA,
      raceB,
      winner,
      region,
      timestamp,
      season
    } = match;

    if (!playerA || !playerB || !raceA || !raceB || !winner || !region) {
      continue;
    }

    const matchId = issue.number;

    const participants = [
      {
        name: playerA,
        opponent: playerB,
        race: raceA,
        opponentRace: raceB,
        result: winner === playerA ? "win" : "loss"
      },
      {
        name: playerB,
        opponent: playerA,
        race: raceB,
        opponentRace: raceA,
        result: winner === playerB ? "win" : "loss"
      }
    ];

    for (const p of participants) {
      // ---------- Player ----------
      if (!players[p.name]) {
        players[p.name] = {
          player: p.name,
          summary: emptyStats(),
          byRace: {},
          byRegion: {},
          matches: []
        };
      }

      const ps = players[p.name].summary;
      ps.total++;
      p.result === "win" ? ps.wins++ : ps.losses++;

      if (!players[p.name].byRace[p.race]) {
        players[p.name].byRace[p.race] = emptyStats();
      }
      const pr = players[p.name].byRace[p.race];
      pr.total++;
      p.result === "win" ? pr.wins++ : pr.losses++;

      if (!players[p.name].byRegion[region]) {
        players[p.name].byRegion[region] = emptyStats();
      }
      const preg = players[p.name].byRegion[region];
      preg.total++;
      p.result === "win" ? preg.wins++ : preg.losses++;

      players[p.name].matches.push({
        id: matchId,
        opponent: p.opponent,
        playerRace: p.race,
        opponentRace: p.opponentRace,
        region,
        result: p.result,
        timestamp,
        season
      });

      // ---------- Race ----------
      if (!races[p.race]) {
        races[p.race] = {
          race: p.race,
          summary: emptyStats(),
          byRegion: {}
        };
      }

      const rs = races[p.race].summary;
      rs.total++;
      p.result === "win" ? rs.wins++ : rs.losses++;

      if (!races[p.race].byRegion[region]) {
        races[p.race].byRegion[region] = emptyStats();
      }
      const rr = races[p.race].byRegion[region];
      rr.total++;
      p.result === "win" ? rr.wins++ : rr.losses++;

      // ---------- Region ----------
      if (!regions[region]) {
        regions[region] = {
          region,
          summary: emptyStats(),
          players: {},
          races: {}
        };
      }

      const regSum = regions[region].summary;
      regSum.total++;
      p.result === "win" ? regSum.wins++ : regSum.losses++;

      if (!regions[region].players[p.name]) {
        regions[region].players[p.name] = emptyStats();
      }
      const regPlayer = regions[region].players[p.name];
      regPlayer.total++;
      p.result === "win" ? regPlayer.wins++ : regPlayer.losses++;

      if (!regions[region].races[p.race]) {
        regions[region].races[p.race] = emptyStats();
      }
      const regRace = regions[region].races[p.race];
      regRace.total++;
      p.result === "win" ? regRace.wins++ : regRace.losses++;
    }
  }

  // ---------- Write players ----------
  for (const p of Object.values(players)) {
    calcWinRate(p.summary);
    Object.values(p.byRace).forEach(calcWinRate);
    Object.values(p.byRegion).forEach(calcWinRate);

    leaderboard.push({
      player: p.player,
      ...p.summary
    });

    fs.writeFileSync(
      path.join(PLAYERS_DIR, `${p.player}.json`),
      JSON.stringify(p, null, 2)
    );
  }

  // ---------- Write races ----------
  for (const r of Object.values(races)) {
    calcWinRate(r.summary);
    Object.values(r.byRegion).forEach(calcWinRate);

    fs.writeFileSync(
      path.join(RACES_DIR, `${r.race}.json`),
      JSON.stringify(r, null, 2)
    );
  }

  // ---------- Write regions ----------
  for (const reg of Object.values(regions)) {
    calcWinRate(reg.summary);
    Object.values(reg.players).forEach(calcWinRate);
    Object.values(reg.races).forEach(calcWinRate);

    fs.writeFileSync(
      path.join(REGIONS_DIR, `${reg.region}.json`),
      JSON.stringify(
        {
          region: reg.region,
          summary: reg.summary,
          players: Object.entries(reg.players).map(([player, stat]) => ({
            player,
            ...stat
          })),
          races: reg.races
        },
        null,
        2
      )
    );
  }

  // ---------- Write leaderboard ----------
  fs.writeFileSync(
    path.join(DATA_DIR, "leaderboard.json"),
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        players: leaderboard.sort((a, b) => b.winRate - a.winRate)
      },
      null,
      2
    )
  );

  console.log("✅ Data build complete");
})();
