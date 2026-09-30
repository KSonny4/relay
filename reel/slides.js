// The Relay pitch, one entry per slide, shared by the deck (index.html) and the phone (control.html).
// Both decks show these slides; the online deck adds RELAY_ONLINE_INTRO in front.
// `say` is the voiceover Petr reads from the phone. `show` is what the room sees: a few words,
// the main point of `say`. *Asterisks* mark emphasised words.
// Slides 1–5 are the one-minute talk. Slides 6–8 continue it: how a take works, the technologies, what's next.
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
      'Today it judges *one rubric,* live, while you talk.',
      'Execution, usefulness and clarity, each from 1 to 5.',
      'The total is execution times two plus usefulness plus clarity, *out of 20.*',
      'Then *one line to fix.* Not a list. One line.',
      'You fix that line, say it again, and the number climbs.',
      'The take is kept.'
    ],
    show: [
      '*One rubric,* live.',
      'Scored *out of 20.*',
      '*One line to fix.*',
      'The take is kept.'
    ]
  },
  {
    say: [
      'That is *working right now.*',
      'The live app is beside me, and it is scoring these exact words while I say them.',
      'I am pitching *Relay* on *Relay*.',
      'The questions stay the same every time. *That is the point.*',
      'A chat box would drift.'
    ],
    show: [
      '*Working right now.*',
      'Relay on Relay.',
      '*Same questions,* every time.',
      'A chat box would drift.'
    ]
  },
  {
    say: [
      'Today, *one judge.* This rubric, live, while I talk.',
      'Next, every team at this hackathon rehearses with it before they present.'
    ],
    show: [
      '*Today, one judge.*',
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
      'One line says *what to fix.*',
      'The take is kept.'
    ],
    show: [
      '*How a take works*',
      'You speak.',
      'Words appear, with times.',
      'Scores update, out of 20.',
      'One line to fix.',
      'The take is kept.'
    ]
  },
  {
    say: [
      '*Technologies,* only the ones that do that job.',
      '*Deepgram* turns speech into text.',
      '*Jev* scores the same three questions from 1 to 5, every time.',
      'The total is Execution × 2 + Usefulness + Clarity, out of 20.',
      'One model writes the single line to fix.'
    ],
    show: [
      '*Deepgram*: speech to text.',
      '*Jev*: the same three, 1 to 5.',
      'Execution × 2 + Usefulness + Clarity.',
      'One model: *the line to fix.*'
    ]
  },
  {
    say: [
      '*What’s next.*',
      'Today Relay judges one rubric, live: this hackathon’s three questions, Execution, Usefulness and Clarity.',
      'Next, you set the criteria. Relay judges *any spoken words against the criteria you set.* A corporate meeting is one example. This hackathon is the first use.'
    ],
    show: [
      '*What’s next*',
      'Today: this hackathon.',
      'Next: *any spoken words.* A meeting.'
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
