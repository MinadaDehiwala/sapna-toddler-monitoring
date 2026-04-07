DOMAINS = ['cognitive', 'motor', 'language', 'social_emotional']
SUCCESS_LEVELS = ['needs_help', 'partial', 'completed', 'mastered']
MODEL_LABELS = ['on_track', 'needs_monitoring', 'at_risk']
SUCCESS_SCORE = {
    'needs_help': 0.22,
    'partial': 0.5,
    'completed': 0.8,
    'mastered': 1.0,
}
DOMAIN_EXPECTATION_BASE = {
    'cognitive': 0.52,
    'motor': 0.55,
    'language': 0.48,
    'social_emotional': 0.5,
}
DOMAIN_EXPECTATION_GROWTH = {
    'cognitive': 0.2,
    'motor': 0.18,
    'language': 0.22,
    'social_emotional': 0.18,
}
FEATURE_COLUMNS = [
    'age_in_months',
    'age_band_progress',
    'weekly_log_count',
    'active_days',
    'engagement_consistency',
    'total_duration_minutes',
    'avg_duration_minutes',
    'avg_parent_confidence',
    'needs_help_ratio',
    'partial_ratio',
    'completed_ratio',
    'mastered_ratio',
    'overall_completion_score',
    'cognitive_log_share',
    'motor_log_share',
    'language_log_share',
    'social_emotional_log_share',
    'cognitive_completion_score',
    'motor_completion_score',
    'language_completion_score',
    'social_emotional_completion_score',
    'cognitive_mastered_ratio',
    'motor_mastered_ratio',
    'language_mastered_ratio',
    'social_emotional_mastered_ratio',
    'cognitive_age_gap',
    'motor_age_gap',
    'language_age_gap',
    'social_emotional_age_gap',
    'overall_age_gap',
]
