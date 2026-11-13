// The Ultra menu of MKDD for ultra-menu.js: the pages, rows, values and lines of the game come from
// ultra/src/menus/menu.c and modes/modes.c of mkdd-ultra, the texts are the site's own
const OFF_ON = ["off", "on"];
const race = { name: "Race", rows: [
  { name: "Game mode", start: 5, texts: ["A normal race. The rules on the other pages still count.", "Every kart starts with three balloons, or as many as you set under Balloons. Every hit pops one and so does falling off the course. Lose them all and you're out! The last kart with balloons wins, or whoever finishes first. A shell or banana held behind your kart saves a balloon. Grand Prix and Versus.", "Every time the leader starts a new lap, the last karts vanish from the race! The final lap is a duel. The top of your screen shows who's in the danger zone and who's out. Grand Prix and Versus, with 3 karts or more.", "Every 12 seconds everyone with empty hands gets a roulette, like from a double item box! With frantic on you only get the strong items. Also in battle.", "Everyone starts with two minutes on the clock and every item hit on someone else adds five seconds. At zero you're out and who gets furthest wins! Based on a CTGP-R mode on the Wii. Grand Prix and Versus.", "Every item box gives green shells and they keep bouncing off the walls until they hit someone! When all the green shells are out you get a red one. Also in Balloon Battle and Shine Thief.", "Five seconds in, the leader gets a bob-omb that goes off twenty seconds later. Bump into someone to pass it on! They can't hand it straight back. Grand Prix and Versus.", "Everyone gets faster with every lap of the leader, CPUs included, up to 1.4 times the top speed on the last lap! Not in 200cc. Grand Prix and Versus."], fixed: true, values: ["normal", "balloon race", "knockout", "item roulette", "countdown", "shell shock", "bob-omb tag", "accelerate"],
    colors: [["#ffffff", "#a0b4d2"], ["#ffb9e1", "#e6287d"], ["#ffd2a0", "#f0641e"], ["#fff064", "#c850ff"], ["#ffa08c", "#d21e1e"], ["#beff8c", "#1ea028"], ["#d7beff", "#6e3cd2"], ["#aaf5ff", "#1e82ff"]],
    about: "Left and right pick a game mode. All rules combine with it. Some modes also work in battle.",
    abouts: [
      "A normal race.",
      "Every kart has balloons. Lose them all and you are out!",
      "Each new lap of the leader puts the last karts out until two are left!",
      "Everyone with empty hands gets a new item every 12 seconds!",
      "Two minutes on your clock. At zero you are out! Hit others to win time!",
      "Shells are unstoppable and are everywhere!",
      "The leader gets a bob-omb that goes off in 20 seconds. Bump someone to pass it on!",
      "Everyone gets faster with every lap!",
    ], shots: { "bob-omb tag": "bob-omb-tag.jpg", countdown: "countdown.jpg", "balloon race": "balloon-race.jpg" } },
  { name: "Teams", text: "Red against blue in Versus and all three battles! Players 1 and 2 against 3 and 4, 1 and 3 against 2 and 4, or 1 and 4 against 2 and 3, and the CPUs fill the smaller team. With two players you're on opposite teams. Items spare your own team, lightning only strikes the other team and nobody steals from a teammate. Fragile karts, bob-omb tag and bomb karts also spare teammates. In Versus every place scores its Grand Prix points and the team with the most wins. In battle one kart's win is a win for its whole team and the CPUs go after the other team. A balloon race and Balloon Battle last until one team is left, and in Shine Thief your team shares one clock.", values: ["off", "1+2 vs 3+4", "1+3 vs 2+4", "1+4 vs 2+3"], shot: "teams.jpg", shots: { "1+3 vs 2+4": "teams-1-3.jpg", "1+4 vs 2+3": "teams-1-4.jpg" }, about: "Red against blue! Items spare your own team." },
  { name: "Laps", counts: true, text: "From 1 up to 50 laps per race. Grand Prix and Versus.", values: ["normal", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "15", "20", "25", "30", "50"], about: "How many laps a race has." },
  { name: "Balloons", summary: "Race balloons", text: "1 to 10 balloons per kart in a balloon race, set apart from Balloon Battle. With more than three, the count shows under your kart.", values: ["normal", "1", "2", "4", "5", "6", "7", "8", "9", "10"], about: "How many balloons every kart starts with." },
  { name: "Mirror Mode", summary: "Mirror", text: "Every course mirrored, in any class! 200cc took Mirror's old spot in the class select, so you can race a mirrored 200cc.", values: OFF_ON, about: "Every course mirrored in every class!" },
] };
const cpu = { name: "CPU", rows: [
  { name: "CPU level", summary: "CPU", text: "How the CPUs race, from Ralf's AI codes. Easy ones hold back and wait with their items. Hard ones go flat out and fire sooner. Brutal ones are even faster. Grand Prix and Versus.", values: ["normal", "easy", "hard", "brutal"], about: "Easy CPUs drive slower and hold on to their items. Brutal is the fastest they get." },
  { name: "CPU characters", summary: "CPU", shots: { "king boo": "cpu-king-boo.jpg" }, text: "Who the CPUs are: random as the game picks them, one weight class, or the same character for every CPU. Grand Prix and Versus.", values: ["random", "light", "medium", "heavy", "baby mario", "baby luigi", "paratroopa", "koopa", "peach", "daisy", "mario", "luigi", "wario", "waluigi", "yoshi", "birdo", "donkey kong", "diddy kong", "bowser", "bowser jr.", "toad", "toadette", "king boo", "petey piranha"], about: "One weight class or one character for every CPU!" },
  { name: "VS CPUs", counts: true, text: "One to seven CPUs in Versus, up to eight karts on the course! Change it between races on the cup select. On your own, off gives you all seven.", values: ["off", "1", "2", "3", "4", "5", "6", "7"], about: "Up to eight karts total in Versus!" },
] };
const items = { name: "Items", rows: [
  { name: "Item boxes", summary: "Boxes", text: "Every item box gives the item you pick, from bananas to Chain Chomps! Frantic gives a strong one at random, shells only gives green or red shells and none turns the roulette off.", values: ["normal", "frantic", "shells only", "none", "bananas", "green shells", "red shells", "blue shells", "mushrooms", "stars", "lightning", "bob-ombs", "golden mushrooms", "bowser shells", "chain chomps", "eggs", "hearts", "giant bananas", "fake item boxes"], about: "Every item box gives this item. Frantic gives only strong items." },
  { name: "Box refill", summary: "Refill", text: "Item boxes come back right away, after four seconds or not at all. With never, every box counts! Also in battle.", values: ["normal", "instant", "slow", "never"], about: "How fast item boxes come back. Never means every box counts!" },
  { name: "Blue shells", summary: "No blue shells", text: "Off and the roulette never lands on a blue shell, also with frantic or shells only.", values: ["on", "off"], about: "Off means no blue shells from any item box!" },
  { name: "Double items", summary: "2x items", text: "Every item box is a double box, so the driver and the partner in the back both get an item!", values: OFF_ON, about: "Every item box is a double box!" },
  { name: "Triple shells", summary: "No triple shells", text: "Anyone can roll three green or red shells as in Mario Kart Wii, not only Koopa and Paratroopa. On from the start.", values: ["on", "off"], about: "Anyone can get three green or red shells from an item box as in Mario Kart Wii!" },
  { name: "Specials for all", summary: "Specials", text: "Every character can roll every special item, from the fireballs to Bowser's shell. In the game only Petey Piranha and King Boo can.", values: OFF_ON, about: "Anyone can roll any special item!" },
] };
const karts = { name: "Karts", rows: [
  { name: "Bumper karts", summary: "Bumper", text: "Karts push each other two, four or eight times as hard when they bump! Light karts can push and heavy karts push the most. There's a limit, so nobody gets shot through a wall.", values: ["off", "x2", "x4", "x8"], about: "Karts push each other harder when they bump and heavy karts push the most." },
  { name: "Fragile karts", summary: "Fragile", text: "A bump breaks both karts, whatever they weigh! They spin, freeze in an ice block or blow up. A star keeps you safe. Grand Prix and Versus.", values: ["off", "spin", "freeze", "blast"], about: "Karts are fragile and will either spin or freeze or blow up on contact!" },
  { name: "Easy mini-turbos", summary: "Mini-turbos", text: "Normally you wiggle the stick left and right during a drift to charge a mini-turbo. With this on, holding the drift is enough!", values: OFF_ON, about: "Drift to charge a mini-turbo. No need to wiggle the stick!" },
  { name: "Road grip", summary: "Grip", text: "Less grip on road and offroad. Wet, ice or glass.", values: ["normal", "wet", "ice", "glass"], about: "Less grip on road and offroad. From wet to ice to glass." },
  { name: "Gravity", text: "Low, moon or space gravity for long jumps and slow falls!", values: ["normal", "low", "moon", "space"], about: "Less gravity for long jumps and slow falls!" },
  { name: "Underdog", text: "Who falls behind drives faster and the leader a little slower. Mild or strong. Grand Prix and Versus.", values: ["off", "mild", "strong"], about: "Players who fall behind drive faster and the leader a little slower." },
  { name: "Random karts", summary: "Random", text: "At the start of every race everyone who plays gets a new kart or new characters or both, picked at random! The kart always fits the heavier character. Also in battle and in LAN play.", values: ["off", "karts", "characters", "both"], about: "A new kart or new characters or both in every race!" },
] };
const battle = { name: "Battle", rows: [
  { name: "Class", text: "Battles at 100, 150 or 200cc, where the game only has 50cc! The CPUs keep up at 200cc.", values: ["50cc", "100cc", "150cc", "200cc"], about: "How fast everyone drives in a battle!" },
  { name: "Balloons", text: "1 to 10 balloons per kart in Balloon Battle. With more than three, your screen shows the count in the color of your balloons.", values: ["normal", "1", "2", "4", "5", "6", "7", "8", "9", "10"], shot: "balloon-battle.jpg", about: "How many balloons every kart starts with." },
  { name: "Bomb karts", text: "Without balloons you drive on with a lit bob-omb, as in Mario Kart 64! Ram a kart that still has balloons and it loses one, but you're out.", values: OFF_ON, shot: "bomb-karts.jpg", about: "Without balloons you drive on as a bob-omb as in Mario Kart 64. Ram a kart to blow it up!" },
  { name: "CPUs", summary: "Battle CPUs", counts: true, shot: "battle-bots.jpg", text: "Up to three CPUs in battle, on a bot engine written from scratch for Ultra! They hunt you down, grab items, drop bananas on your tail and drift for mini-turbos. In Shine Thief they run off with the Shine and in Bob-omb Blast they bomb your path. On your own, off gives you all three.", values: ["off", "1", "2", "3"], about: "Add CPUs to a battle!" },
  { name: "CPU level", summary: "Battle CPU", text: "How good the CPUs are. Easy ones wait longer to fire, aim worse and leave you alone more. Hard ones fire sooner and shoot back at who's behind them. Brutal ones are also faster and come for you first.", values: ["normal", "easy", "hard", "brutal"], about: "Easy CPUs wait longer and aim worse. Brutal CPUs drive faster and come after you." },
] };
const settings = { name: "Settings", rows: [
  { name: "Widescreen", text: "For a TV that stretches the picture to 16:9. Every screen gets a wider view, including split screen and Time Trials. Ralf and Kester's widescreen code as a setting in the game.", values: OFF_ON, about: "For a TV that stretches the picture to 16:9." },
  { name: "Kart stats", text: "The character select shows six rows of stars per kart: speed, acceleration, weight, offroad, mini-turbo and handling. Also with two to four karts, where the game shows no stars at all.", values: OFF_ON, stock: 1, shot: "kart-stats.jpg", about: "See the hidden stats of every kart!" },
  { name: "Duplicate characters", text: "Pick a character someone else already has, or the same one twice in your own kart.", values: OFF_ON, stock: 1, shot: "twins.jpg", about: "Pick the same character as someone else or twice in your kart!" },
  { name: "Slide attack", text: "Press the D-pad left or right and your kart lunges that way, bashing the kart beside you. Every kart can, not only the rider in the back in co-op.", values: OFF_ON, stock: 1, shot: "slide-attack.jpg", about: "D-pad left or right bashes the kart beside you!" },
  { name: "Look back", text: "Hold the D-pad down to look behind you, or Y when you have no item. X and the D-pad up sound the horn. Also in Time Trials and LAN play.", values: OFF_ON, stock: 1, about: "Hold the D-pad down or Y without an item to look behind you." },
  { name: "Slipstream", text: "Stay right behind another kart for a second and a half and you shoot forward, as in Mario Kart Wii. The CPUs also do it.", values: OFF_ON, stock: 1, shot: "slipstream.jpg", about: "Drive right behind another kart to charge a boost as in Mario Kart Wii." },
  { name: "Hop", text: "Press L or R and the kart hops, and the drift starts when it lands, as in Mario Kart Wii.", values: OFF_ON, stock: 1, about: "L or R makes the kart hop and the drift starts when it lands as in Mario Kart Wii." },
  { name: "Tricks", text: "Press L or R as you fly off a ramp or a big bump for a trick and a mini-turbo when you land, as in Mario Kart Wii.", values: OFF_ON, stock: 1, shot: "tricks.jpg", about: "Press L or R as you jump off a ramp or big bump for a trick and a boost!" },
  { name: "Hold items", text: "Hold X or Y and your banana or shell sits behind your kart as a shield, as in Mario Kart Wii. Three shells circle you. Let go to use it. The CPUs also do it.", values: OFF_ON, stock: 1, shot: "hold-items.jpg", about: "Hold X or Y to keep a banana or shell behind you as a shield and let go to use it!" },
  { name: "Race results", text: "The results stay on the screen until P1 presses A, as in Mario Kart 64.", values: OFF_ON, stock: 1, about: "At the end of a race the results stay on the screen until P1 presses A as in Mario Kart 64." },
] };
ultraMenu(document.getElementById("menu"), {
  pages: [race, cpu, items, karts, battle, settings],
  resets: [race, cpu, items, karts, battle],
  img: "img/",
  alts: {
    "battle-bots.jpg": "Balloon Battle alone on Wii Block Plaza: Mario and Luigi are down to one balloon with a green shell held behind them, and the CPUs Koopa and Paratroopa with yellow balloons drive right beside them",
    "cpu-king-boo.jpg": "Luigi on SNES Mario Circuit 1 with three mushrooms around him and King Boo beside him, and every CPU in the ranking on the left is a pair of King Boos",
    "bob-omb-tag.jpg": "Four players in bob-omb tag on DS Shroom Ridge: Peach and Daisy lead with the bob-omb held up, 19 seconds left on it",
    "balloon-race.jpg": "A balloon race on SNES Mario Circuit 1: Luigi's kart with three red balloons, boosting past Toadette with Petey Piranha ahead",
    "countdown.jpg": "Four players in countdown on the pier of DS Cheep-Cheep Beach, each with 1:50 left on the clock at the top of the screen",
    "tricks.jpg": "Mario and Luigi's kart in the air over the sea of DS Cheep-Cheep Beach, rolled to its side in a trick",
    "hold-items.jpg": "Luigi and Mario's kart on Wii Daisy Circuit with three red shells around it, one behind the left wheel, one by the right wheel and one in Mario's hand",
    "slipstream.jpg": "Luigi's kart right behind Waluigi on SNES Mario Circuit 1, with white streaks of wind along it",
    "slide-attack.jpg": "Waluigi bashing Daisy's kart sideways with stars flying on Wii Luigi Circuit, seen from two of the four screens",
    "twins.jpg": "The character select with four players, each with the same character twice: two Marios, two Peaches, two Bowsers and two Warios",
    "kart-stats.jpg": "The character select with four players in their karts, Luigi and Mario, Daisy and Peach, Bowser Jr. and Bowser, Waluigi and Wario, each box with six rows of stars",
    "balloon-battle.jpg": "Four players in Balloon Battle on Wii Block Plaza, each screen with its balloon count in the corner",
    "teams.jpg": "Four players in Teams at the start on Wii Luigi Circuit: the screens of players 1 and 2 say Red team over the faces of their teammates in red discs, those of players 3 and 4 Blue team with blue ones",
    "teams-1-3.jpg": "The same start with 1+3 vs 2+4: Red team on the screens of players 1 and 3, Blue team on those of players 2 and 4",
    "teams-1-4.jpg": "The same start with 1+4 vs 2+3: Red team on the screens of players 1 and 4, Blue team on those of players 2 and 3",
    "bomb-karts.jpg":"Balloon Battle alone on Wii Block Plaza: Mario and Luigi have no balloons left and hold a lit bob-omb, with a bob-omb at the top of the screen",
  },
});
