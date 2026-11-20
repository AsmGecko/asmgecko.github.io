// The Ultra menu of Strikers for ultra-menu.js: the pages, rows, values and help lines of the game come from
// ultra/src/menu.c of strikers-ultra, the texts are the site's own
const OFF_ON = ["off", "on"];
const rules = { name: "Rules", header: "RULES   1 OF 6", rows: [
  { name: "Game mode", start: 1, texts: ["Plain Strikers, no extra rules. The other settings still count.", "Keep the ball for four seconds and it blows up at your feet and knocks you over. A touch by anyone else starts the fuse over, teammates included. The ball heats up through yellow and orange to red, and flashes in the last second.", "The same blast, but the fuse is ten seconds and only a touch of the other team starts it over. It flashes in the last three seconds.", "Four passes in a row between teammates and the ball turns gold, and a goal with it is worth one more. The ball warms up with every pass of the streak and the count stands beside the score, and one touch of the other team starts the count again.", "Every goal costs your team a sidekick at the next kickoff. A goal worth two costs two. The captain always stays and every human keeps a player. Your fourth goal wins the match.", "Only a Super Strike scores, and the sidekicks can strike. Every other shot bounces off the goal mouth like off the electric fence. In sudden death any goal wins. Needs Super Strike on in the game's options.", "One of the five game modes at random, a new one every match. The kickoff shows which one came up."], values: ["normal", "short fuse (solo)", "short fuse (team)", "golden ball", "last man standing", "strikes only", "random"], shots: { "short fuse (solo)": "short-fuse-blast.jpg", "short fuse (team)": "short-fuse-heat.jpg", "last man standing": "last-man.jpg" },
    abouts: ["Plain Strikers, no special rules.", "Hold the ball for 4 seconds and it blows up. Anyone else touching it resets the timer.",
      "Hold the ball for 10 seconds and it blows up. Only the other team touching it resets the timer.", "4 passes in a row make the ball golden, and a goal with it is worth one more.",
      "Every goal you score costs you a sidekick. Your fourth goal wins.",
      "Only Super Strikes count, and sidekicks can strike too. Needs SUPER STRIKE on.", "A random mode every match."] },
  { name: "Strike block", shot: "strike-block.jpg", text: "When the other team goes for a Super Strike, PICK A CORNER! comes up and you hold the stick left or right. Left and right are your goalie's, as he faces the strike. Pick the corner of the shot and he saves it, unless the strike was perfect. A wrong corner leaves it to the goalie as usual. Works when your side has a human on it.", values: OFF_ON,
    abouts: ["Only the goalie stops a Super Strike.", "Pick a corner with the stick during a Super Strike. The right one saves all but a perfect strike."] },
  { name: "Captain powers", text: "Passes, shots, steals and hits fill a meter under your name beside the score. Once it's full your captain glows, and the D-pad sets off the power. Every captain has a power of their own: Mario gets a star, Luigi the tornado of the beta's Twister power up, Peach freezes everyone near her, Daisy gives her team a mushroom, Donkey Kong pounds the ground and tilts the field toward the goal he attacks, Wario's blast turns the sticks of whoever it catches around, Waluigi's lightning strikes whoever has the ball and Yoshi's tongue pulls the ball to him. On fast the meter fills twice as fast, a goal against fills it halfway, and the CPU uses its own.", values: ["off", "on", "fast"], shot: "captain-powers.jpg",
    abouts: ["No captain powers.", "Passes, shots, steals and hits fill the meter under your name. When it's full, press the D-pad.", "Passes, shots, steals and hits fill the meter twice as fast. When it's full, press the D-pad."] },
  { name: "Penalties", text: "A match that is tied at full time goes to penalties instead of the game's sudden death: one kick a side until one scores and the other doesn't, with the camera behind the kicker. The kicker aims with the stick as always, the keeping side picks a side of the screen with the stick, and the bar on screen asks for it. No pick or a wrong one is a goal, a right one is down to how good the shot was.", values: OFF_ON, shot: "penalties.jpg",
    abouts: ["A tie goes to sudden death: next goal wins.", "A tie goes to a penalty shootout."] },
  { name: "Red cards", text: "Hit or slide into a player who hasn't got the ball and the whistle blows for a yellow card. The second one is red, and the fouler disappears for 15 seconds of play while their team plays one short. With straight red the first foul is a red. A normal tackle on the ball carrier is fine, and a goal brings everyone back.", values: ["off", "on", "straight red"],
    abouts: ["No cards.", "Hit a player without the ball: yellow card. Two yellows: off for 15 seconds.", "Hit a player without the ball and you are off for 15 seconds."] },
  { name: "Rotating teams", text: "With three or four players the teams change at the kickoff after every goal: 1 and 2 against 3 and 4, then 1 and 3 against 2 and 4, then 1 and 4 against 2 and 3, and then the same pairs on the other sides. Every goal counts for everyone on the side that scored it, and after the match the standings show who scored the most, rematches included.", values: OFF_ON, shot: "standings.jpg", about: "3 or 4 players: new teams after every goal, so everyone plays with everyone." },
] };
const chaos = { name: "Chaos", header: "CHAOS   2 OF 6", rows: [
  { name: "Bowser", text: "The game brings Bowser in about half the matches. With every match he comes in all of them, with nonstop after 15 seconds and again after every attack, and with never he stays away. Bowser move picks what he does.", values: ["as set", "every match", "nonstop", "never"], shot: "bowser.jpg",
    abouts: ["Follows BOWSER ATTACK in GAMEPLAY OPTIONS.", "Bowser shows up in every match.", "Bowser comes after 15 seconds and again after every attack.", "Bowser stays home."] },
  { name: "Bowser move", text: "What Bowser does when he comes: he rolls over the field, jumps on the players, throws shells and then jumps, or stomps so the whole field tilts. Random picks one each time. Set Bowser to every match or nonstop to see it.", values: ["random", "roll", "jump", "shells and jumps", "stomp"], shot: "bowser.jpg",
    abouts: ["Bowser picks a random attack.", "Bowser rolls over the field.", "Bowser jumps on the players.", "Bowser throws shells, then jumps.", "Bowser stomps and the field tilts."] },
  { name: "Power up rate", text: "A team's power up meter fills when it gets fouled and when it makes a power shot. 2x fills it twice as fast, fast gives a power up about every second, never gives none, and fair has no meter at all and gives both teams the same power up every 15 seconds of play.", values: ["normal", "2x", "fast", "never", "fair"],
    abouts: ["Power ups come at the normal rate.", "Power ups come twice as often.", "A power up about every second.", "No power ups at all.", "Every 15 seconds both teams get the same power up."] },
  { name: "Power up type", shots: { "bob-ombs": "powerup-bob-omb.jpg" }, text: "Every power up you earn is the one you pick: green shells, red shells, bananas, bob-ombs or stars. All is the game's own mix.", values: ["all", "green shells", "red shells", "bananas", "bob-ombs", "stars"],
    abouts: ["Every kind of power up, as the game has it.", "Every power up you earn is a green shell.", "Every power up you earn is a red shell.", "Every power up you earn is a banana.", "Every power up you earn is a bob-omb.", "Every power up you earn is a star."] },
  { name: "Beta power ups", text: "Bob-ombs and bananas as the beta had them. When you use a bob-omb it can turn into a mine, and a banana you use can come out bigger or explode. There's a chance of it every time.", values: OFF_ON, abouts: ["Bob-ombs and bananas work as usual.", "Bob-ombs you use can turn into mines. Bananas can grow or explode."] },
  { name: "Electric fence", texts: ["The game's own fence. It zaps a player knocked into it by a hit, a bob-omb or a Super Strike.", "A player thrown off the fence flies about three times as far. The fence also zaps players knocked into it by a slide tackle, a shell or a banana.", "Every touch zaps, even a player just running into the fence. With the ball you lose it, and you fly as far as with super strong. A star protects you, and the goal mouth never zaps.", "The fence is a plain wall and never zaps or sparks, whatever knocks you into it."], values: ["normal", "super strong", "high voltage", "off"],
    abouts: ["The game's fence: it zaps players knocked into it by a hit or a blast.", "Players fly three times as far. A slide tackle, shell or banana into it zaps.", "Every touch zaps and sends you flying.", "No zaps and no sparks. The fence is just a wall."] },
] };
const match = { name: "Match", header: "MATCH   3 OF 6", rows: [
  { name: "Series", shot: "series.jpg", text: "Rematches between the same teams count: best of 3, 5 or 7. The menu after every match shows the wins, and once a team has enough it says who won the series. The next rematch starts a new one. With rotating teams on, the standings count instead.", values: ["off", "best of 3", "best of 5", "best of 7"],
    abouts: ["Rematches are just more matches.", "Rematches count: first to 2 wins.", "Rematches count: first to 3 wins.", "Rematches count: first to 4 wins."] },
  { name: "Random pick", text: "A new draw for every Grudge Match: new captains and sidekicks for both sides, a random stadium, or both. What you picked in the menus is back after the match.", values: ["off", "stadium", "teams", "all"], shot: "loading.jpg",
    abouts: ["Captains, sidekicks and stadium as picked.", "A random stadium every GRUDGE MATCH.", "Random captains and sidekicks every GRUDGE MATCH.", "Random captains, sidekicks and stadium every GRUDGE MATCH."] },
  { name: "All captains", text: "Every sidekick becomes a copy of its captain: four Waluigis against four Warios. The game had a hidden switch for it. Grudge Match only.", values: OFF_ON, shot: "all-captains.jpg", about: "Sidekicks become copies of their captain. Only in GRUDGE MATCH." },
  { name: "Super tackles", text: "A body check or a slide tackle throws the player about six meters the way the tackle goes. A slide also knocks them over.", values: OFF_ON, about: "Big hits and slide tackles send players flying." },
  { name: "Match time", text: "Match lengths the game's options don't have: 30 seconds, 1 minute, or 7, 20, 30 and 60 minutes. As set uses the game's own option.", values: ["as set", "0:30", "1:00", "7:00", "20:00", "30:00", "60:00"], about: "Match lengths the game doesn't have. AS SET uses GAMEPLAY OPTIONS." },
  { name: "Goal limit", text: "The first team to 3, 5, 7, 10 or 15 goals wins at once. With a match time of 60 minutes only the goals decide.", values: ["off", "3 goals", "5 goals", "7 goals", "10 goals", "15 goals"], about: "Ends the match early when a team reaches this score." },
] };
const tuning = { name: "Tuning", header: "TUNING   4 OF 6", rows: [
  { name: "Player speed", text: "How fast the players run, from half to twice as fast. They reach that speed and stop in the same time as before. Goalies stay as they are.", values: ["100%", "125%", "150%", "200%", "75%", "50%"], about: "How fast players run. Goalies keep their speed." },
  { name: "Shot power", text: "How hard the regular shots go, from half to three times, up to the speed the game allows. Super Strikes stay as they are.", values: ["100%", "150%", "200%", "300%", "75%", "50%"], about: "How hard normal shots fly." },
  { name: "Ball bounce", text: "How much the ball bounces off the ground, the walls, the posts and the players: livelier, keeping almost all its speed, or dead.", values: ["normal", "bouncy", "super bouncy", "dead"],
    abouts: ["The ball bounces like it always did.", "A livelier ball.", "The ball keeps almost all its speed when it bounces.", "A ball that barely bounces."] },
  { name: "Ball grip", text: "How far the ball rolls: slippery and icy roll much further, sticky stops quickly, so passes arrive late.", values: ["normal", "slippery", "icy", "sticky"],
    abouts: ["The ball rolls like it always did.", "The ball rolls a lot further.", "The ball hardly slows down at all.", "The ball stops quickly, so passes arrive late."] },
  { name: "Superhuman CPU", text: "Legend gets the Superhuman difficulty of the beta, which the final game hid, with every chance at its maximum and perfect Super Strikes. It takes effect from the next match.", values: OFF_ON, about: "Makes LEGEND even tougher." },
  { name: "Descriptions", text: "The line of help under the rows of this menu, on or off.", values: ["on", "off"], about: "Shows help under the settings, like this line." },
] };
const extras = { name: "Extras", header: "EXTRAS   5 OF 6", rows: [
  { name: "Sidekick strikes", text: "Only captains can Super Strike in the game. With this on the sidekicks can, with the short strike the game only gave the Super Team, and it counts two goals like a captain's. Needs Super Strike on in the game's options.", values: OFF_ON, about: "Sidekicks can take Super Strikes too. Needs SUPER STRIKE on." },
  { name: "Underdog", text: "The team that's behind gets help: its power up meter fills half again as fast for every goal it's behind, up to three times as fast, and its power ups more often turn into a star, a spiny shell or a red shell. One goal behind that's one time in three, three goals behind every time.", values: OFF_ON, about: "The trailing team earns power ups faster and can get better ones." },
  { name: "Mirror look", text: "When both teams of a Grudge Match have the same captain, the away team gets a look of its own: shadow is dark violet with glowing yellow eyes, metal is silver and gold is gold, for the captain, the sidekicks and the goalie.", values: ["shadow", "metal", "gold"], shot: "shadow-mario.jpg", shots: { metal: "metal-mario.jpg", gold: "gold-mario.jpg" },
    abouts: ["Same captain on both sides: the away team plays in dark violet, with glowing eyes.", "Same captain on both sides: the away team plays in silver.", "Same captain on both sides: the away team plays in gold."] },
  { name: "Menu music", text: "Dark plays three tracks from the beta on the title screen, in the menus and between the matches of a cup, music the final game never plays. The music changes as soon as you pick it.", values: ["normal", "dark"],
    abouts: ["The game's own music in the title, menus and cups.", "The beta menu music the game never plays, in the title, menus and cups."] },
] };
const debug = { name: "Debug", header: "DEBUG   6 OF 6", rows: [
  { name: "Memory info", shot: "debug-memory.jpg", text: "A bar with the free memory of the game. The switches on this page are the developers' own, found through Ralf's codes, and they aren't saved.", values: OFF_ON, about: "A bar with the free memory." },
  { name: "Culling info", shot: "debug-culling.jpg", text: "Shows what the game leaves out of the picture.", values: OFF_ON, about: "Shows what the game does not draw." },
  { name: "Bounding spheres", text: "Draws a sphere around every object.", values: OFF_ON, about: "Draws a sphere around every object." },
  { name: "Bounding boxes", text: "Draws a box around every model.", values: OFF_ON, about: "Draws a box around every model." },
  { name: "Safe frame", shot: "debug-safe-frame.jpg", text: "Draws the part of the picture every TV shows.", values: OFF_ON, about: "Draws the area every TV shows." },
  { name: "Frame smiler", shot: "debug-smiler.jpg", text: "A face in the corner that frowns when the game slows down.", values: OFF_ON, about: "A face that frowns when the game slows down." },
] };
ultraMenu(document.getElementById("menu"), {
  pages: [rules, chaos, match, tuning, extras, debug],
  img: "img/",
  alts: {
    "strike-block.jpg": "A captain winding up a Super Strike with the meter around him, and the bar PICK A CORNER! across the bottom of the screen",
    "series.jpg": "The menu after a match: SERIES BEST OF 3, Mario 0 and Luigi 2, LUIGI WINS THE SERIES, above REMATCH, CHANGE CAPTAINS and QUIT",
    "last-man.jpg": "The field with 3 LEFT and 1 LEFT beside the score: Luigi's team is down to its captain, who has scored three goals",
    "short-fuse-heat.jpg": "Wario dribbling a red-hot ball in Bowser Stadium, with Warios as teammates",
    "short-fuse-blast.jpg": "The ball blows up under Wario and throws him into the air",
    "captain-powers.jpg": "Donkey Kong's ground pound: a column of light, earth flying up and the players around him falling over",
    "all-captains.jpg": "The team intro before kickoff: four Waluigis, one of them jumping over the others",
    "bowser.jpg": "Bowser on the field in Bowser Stadium breathing fire between the Warios and Waluigis",
    "standings.jpg": "The menu after the match: Standings, with P1 and P3 on 1 point and P2 and P4 on 0, over Rematch, Change captains and Quit",
    "loading.jpg": "The loading screen: Today at Bowser Stadium, Wario versus Waluigi",
    "powerup-bob-omb.jpg": "A giant bob-omb rolling among the players in front of the goal",
    "debug-memory.jpg": "A line of small letters over the match: 437 free, 428 block, 920 virt (KB)",
    "debug-culling.jpg": "A line of small letters over a goal: 342 submitted, 261 culled, 81 drawn",
    "debug-safe-frame.jpg": "Luigi cheering after a goal, with a thin green frame a little inside the edges of the picture",
    "debug-smiler.jpg": "A small green face in the bottom left corner during the replay of a goal",
    "shadow-mario.jpg": "The team intro before kickoff: a dark violet Mario with glowing yellow eyes, and two dark violet Toads behind him",
    "metal-mario.jpg": "The team intro before kickoff: a silver Mario, and two silver Toads behind him",
    "gold-mario.jpg": "The team intro before kickoff: a golden Mario, and two golden Toads behind him",
    "penalties.jpg": "Mario on the penalty spot seen from behind, Kritter in the goal, and Penalties 0 - 0 under the score",
  },
});
