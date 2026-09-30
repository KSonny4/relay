// The Relay pitch, one entry per slide, shared by the deck (index.html) and the phone (control.html).
// Both decks show these slides; the online deck adds RELAY_ONLINE_INTRO in front.
// `say` is the voiceover Petr reads from the phone: slides 1–5 are the "60 seconds" section of pitch.md,
// one slide per timestamp; slides 6–8 continue for two minutes. `show` is what the room sees: a few words,
// the main point of `say`. *Asterisks* mark emphasised words.
window.RELAY_SLIDES = [
  {
    say: [
      'Hackathon teams find out their pitch failed only after they sit down.',
      'By then the judges have moved on, and nobody tells you which sentence lost them.'
    ],
    show: [
      '*Only after they sit down.*',
      'Which sentence lost them?'
    ]
  },
  {
    say: [
      '*Relay* fixes that before you stand up.',
      'You say your pitch out loud, and Relay scores it on execution, usefulness and clarity, each from 1 to 5.',
      'The total is execution times two plus usefulness plus clarity, *out of 20.*',
      'Then it gives you *one line to fix.*',
      'Not a list.',
      'One line.',
      'You fix that line, say it again, and the number climbs.'
    ],
    show: [
      '*Before you stand up.*',
      'Scored *out of 20.*',
      '*One line to fix.*',
      'The number climbs.'
    ]
  },
  {
    say: [
      'That is *working right now.*',
      'The live app is beside me, and it is scoring these exact words while I say them.',
      'I am pitching *Relay* on *Relay*.'
    ],
    show: [
      '*Working right now.*',
      'Relay on Relay.'
    ]
  },
  {
    say: [
      'Today I am building it.',
      'Next, every team at this hackathon rehearses with it before they present.'
    ],
    show: [
      'Building it today.',
      'Next, *every team rehearses.*'
    ]
  },
  {
    say: [
      'So here is what to try next: say your pitch to Relay, fix the one line it gives you, and *walk in already knowing your number.*'
    ],
    show: [
      'Say it. Fix one line.',
      '*Know your number.*'
    ]
  },
  {
    say: [
      '*How a take works.*',
      'You speak.',
      'The words show with their times.',
      'The three scores and the total out of 20 update.',
      'One line says *what to fix.*'
    ],
    show: [
      '*How a take works*',
      'You speak.',
      'Words appear, with times.',
      'Scores update, out of 20.',
      'One line to fix.'
    ]
  },
  {
    say: [
      '*Technologies,* only the ones that do that job.',
      '*Deepgram* turns speech into text.',
      '*Jev* scores the three questions from 1 to 5.',
      'The total is Execution × 2 + Usefulness + Clarity, out of 20.',
      'One model writes the single line to fix.'
    ],
    show: [
      '*Deepgram*: speech to text.',
      '*Jev*: three scores, 1 to 5.',
      'Execution × 2 + Usefulness + Clarity.',
      'One model: *the line to fix.*'
    ]
  },
  {
    say: [
      '*What’s next.*',
      'Today Relay judges this hackathon’s three questions: Execution, Usefulness and Clarity.',
      'Next, Relay judges *any spoken words against the criteria you give it.* This hackathon is the first use.'
    ],
    show: [
      '*What’s next*',
      'Today: this hackathon.',
      'Next: *any spoken words, your criteria.*'
    ]
  }
];

// The online deck opens with one extra slide; leaving it starts the recording in the live app.
window.RELAY_ONLINE_INTRO = {
  say: [
    'The recording starts on the next slide: from there, the live app beside me hears this pitch and scores it out of 20.'
  ],
  show: [
    'Recording starts *on the next slide.*'
  ]
};

// The slides of this site's deck. mode.js, served by server.py, sets RELAY_MODE to "online" on the online site.
window.relayDeck = function () {
  var online = window.RELAY_MODE === 'online';
  var offset = online ? 1 : 0;
  return {
    online: online,
    offset: offset,
    slides: online ? [window.RELAY_ONLINE_INTRO].concat(window.RELAY_SLIDES) : window.RELAY_SLIDES
  };
};
