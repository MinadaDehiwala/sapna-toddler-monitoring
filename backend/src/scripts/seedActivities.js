const { connectMongo } = require('../config/mongo');
const Activity = require('../models/Activity');
const { initializeFirebase } = require('../config/firebase');

const ACTIVITY_SEED = [
  {
    code: 'A12_OBJ_HIDE',
    title: 'Find The Hidden Toy',
    description: 'Hide a toy under a cup and encourage your child to find it.',
    domain: 'cognitive',
    ageBandMinMonths: 12,
    ageBandMaxMonths: 17,
    estimatedMinutes: 10,
    instructions: ['Show the toy first.', 'Hide under one cup.', 'Celebrate discovery.']
  },
  {
    code: 'A12_STACK_TWO',
    title: 'Stack Two Blocks',
    description: 'Encourage stacking two blocks independently.',
    domain: 'motor',
    ageBandMinMonths: 12,
    ageBandMaxMonths: 17,
    estimatedMinutes: 8,
    instructions: ['Demonstrate once.', 'Offer large safe blocks.', 'Track attempts and success.']
  },
  {
    code: 'A12_NAME_GAME',
    title: 'Name Familiar Objects',
    description: 'Point to familiar objects and say their names together.',
    domain: 'language',
    ageBandMinMonths: 12,
    ageBandMaxMonths: 17,
    estimatedMinutes: 10,
    instructions: ['Use daily household items.', 'Repeat names slowly.', 'Encourage imitation.']
  },
  {
    code: 'A12_PEEKABOO',
    title: 'Peek-a-boo Interaction',
    description: 'Practice turn-taking and social engagement through peek-a-boo.',
    domain: 'social_emotional',
    ageBandMinMonths: 12,
    ageBandMaxMonths: 17,
    estimatedMinutes: 7,
    instructions: ['Make eye contact.', 'Alternate turns hiding.', 'Observe child response.']
  },
  {
    code: 'A18_SORT_COLORS',
    title: 'Color Sort Buckets',
    description: 'Sort objects into colored bowls with parent guidance.',
    domain: 'cognitive',
    ageBandMinMonths: 18,
    ageBandMaxMonths: 23,
    estimatedMinutes: 12,
    instructions: ['Use 2 colors first.', 'Name colors aloud.', 'Praise matching attempts.']
  },
  {
    code: 'A18_BALANCE_PATH',
    title: 'Tape Line Balance Walk',
    description: 'Walk along a taped line on the floor to improve balance.',
    domain: 'motor',
    ageBandMinMonths: 18,
    ageBandMaxMonths: 23,
    estimatedMinutes: 10,
    instructions: ['Create short straight line.', 'Hold hand if needed.', 'Reduce support gradually.']
  },
  {
    code: 'A18_BODY_PARTS',
    title: 'Point To Body Parts',
    description: 'Ask child to identify body parts during play.',
    domain: 'language',
    ageBandMinMonths: 18,
    ageBandMaxMonths: 23,
    estimatedMinutes: 8,
    instructions: ['Ask one body part at a time.', 'Model answer.', 'Repeat with songs.']
  },
  {
    code: 'A18_FEELINGS_FACE',
    title: 'Feelings Mirror Game',
    description: 'Use mirror play to identify happy, sad, and surprised expressions.',
    domain: 'social_emotional',
    ageBandMinMonths: 18,
    ageBandMaxMonths: 23,
    estimatedMinutes: 10,
    instructions: ['Model expression first.', 'Name each feeling.', 'Encourage child imitation.']
  },
  {
    code: 'A24_PATTERN_PLAY',
    title: 'Simple Pattern Play',
    description: 'Create and copy simple object patterns.',
    domain: 'cognitive',
    ageBandMinMonths: 24,
    ageBandMaxMonths: 29,
    estimatedMinutes: 12,
    instructions: ['Start with AB pattern.', 'Use visual prompts.', 'Let child complete sequence.']
  },
  {
    code: 'A24_JUMP_GAME',
    title: 'Jump On Spot',
    description: 'Practice two-foot jumps with playful prompts.',
    domain: 'motor',
    ageBandMinMonths: 24,
    ageBandMaxMonths: 29,
    estimatedMinutes: 10,
    instructions: ['Demonstrate safe jumping.', 'Count each jump.', 'Rest between rounds.']
  },
  {
    code: 'A24_STORY_RECALL',
    title: 'Short Story Recall',
    description: 'Read a short story and ask simple follow-up questions.',
    domain: 'language',
    ageBandMinMonths: 24,
    ageBandMaxMonths: 29,
    estimatedMinutes: 12,
    instructions: ['Use picture books.', 'Ask who/what questions.', 'Encourage sentence replies.']
  },
  {
    code: 'A24_SHARE_TURN',
    title: 'Sharing Turn Game',
    description: 'Practice sharing and waiting turns using one toy.',
    domain: 'social_emotional',
    ageBandMinMonths: 24,
    ageBandMaxMonths: 29,
    estimatedMinutes: 9,
    instructions: ['Use timer for turns.', 'Model calm waiting.', 'Acknowledge successful sharing.']
  },
  {
    code: 'A30_COUNT_MATCH',
    title: 'Count And Match',
    description: 'Match counted objects to number cards.',
    domain: 'cognitive',
    ageBandMinMonths: 30,
    ageBandMaxMonths: 36,
    estimatedMinutes: 12,
    instructions: ['Count 1-5 first.', 'Use large visuals.', 'Increase complexity slowly.']
  },
  {
    code: 'A30_PINCER_ART',
    title: 'Sticker Fine Motor Art',
    description: 'Use stickers to improve pincer grasp and placement control.',
    domain: 'motor',
    ageBandMinMonths: 30,
    ageBandMaxMonths: 36,
    estimatedMinutes: 11,
    instructions: ['Peel together first.', 'Place within outlines.', 'Track hand control.']
  },
  {
    code: 'A30_THREE_WORDS',
    title: 'Three-Word Sentences',
    description: 'Prompt child to express needs in 3-word phrases.',
    domain: 'language',
    ageBandMinMonths: 30,
    ageBandMaxMonths: 36,
    estimatedMinutes: 10,
    instructions: ['Model phrase first.', 'Offer choices.', 'Praise attempts clearly.']
  },
  {
    code: 'A30_HELPER_TASK',
    title: 'Home Helper Routine',
    description: 'Assign small routine tasks to build independence and social responsibility.',
    domain: 'social_emotional',
    ageBandMinMonths: 30,
    ageBandMaxMonths: 36,
    estimatedMinutes: 10,
    instructions: ['Pick one simple task.', 'Use consistent routine.', 'Celebrate completion.']
  }
];

async function seedActivities() {
  initializeFirebase();
  await connectMongo();

  for (const activity of ACTIVITY_SEED) {
    await Activity.findOneAndUpdate(
      { code: activity.code },
      { $set: activity },
      { upsert: true, new: true }
    );
  }

  const total = await Activity.countDocuments();
  console.log(`Activity seed completed. Total activities: ${total}`);
  process.exit(0);
}

seedActivities().catch((error) => {
  console.error('Failed to seed activities', error);
  process.exit(1);
});
