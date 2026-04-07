const CDC_BASELINES = [
  {
    min: 12,
    max: 17,
    domainFocus: {
      language: 'Encourage simple words, sound imitation, and name recognition.',
      motor: 'Focus on assisted walking, stacking, and hand-eye coordination.',
      cognitive: 'Use object permanence and matching games.',
      social_emotional: 'Practice peek-a-boo and turn-taking with caregivers.'
    }
  },
  {
    min: 18,
    max: 23,
    domainFocus: {
      language: 'Encourage 2-word combinations and pointing to body parts.',
      motor: 'Use balance play, ball rolling, and climbing with supervision.',
      cognitive: 'Practice simple problem-solving and shape sorting.',
      social_emotional: 'Model emotional naming and guided sharing.'
    }
  },
  {
    min: 24,
    max: 29,
    domainFocus: {
      language: 'Support short phrases, action words, and simple stories.',
      motor: 'Work on jumping, kicking, and crayon control.',
      cognitive: 'Use pattern games and memory recall activities.',
      social_emotional: 'Encourage cooperative play and routine transitions.'
    }
  },
  {
    min: 30,
    max: 36,
    domainFocus: {
      language: 'Practice conversation turns and 3-word sentences.',
      motor: 'Develop fine motor control through puzzle and drawing tasks.',
      cognitive: 'Introduce sequencing and simple counting routines.',
      social_emotional: 'Strengthen empathy cues and independent task attempts.'
    }
  }
];

const SUCCESS_SCORE = {
  needs_help: 0.25,
  partial: 0.5,
  completed: 0.8,
  mastered: 1
};

function getBaselineByAge(ageInMonths) {
  return CDC_BASELINES.find((item) => ageInMonths >= item.min && ageInMonths <= item.max) || null;
}

function scoreFromSuccessLevel(level) {
  return SUCCESS_SCORE[level] ?? 0;
}

module.exports = {
  getBaselineByAge,
  scoreFromSuccessLevel
};
