# TEST freeze

Chosen: quantile18
Rule: argmax valAcc s.t. minTrain>=50; tie fewer-regimes, alphabetical; fallback quantile18
Candidates: [{"k":"quantile18","acc":0.5194029850746269,"regimes":3,"minTrain":335},{"k":"treeLeaves","acc":0.4835820895522388,"regimes":4,"minTrain":59}]
Kept cols (19): ret_120,ret_180,ret_300,ret_600,vol_180,vol_300,vol_600,range_60,range_300,position_in_range_300,direction_flips_300s,vol_expansion_180v300,range_expansion_180v300,prev_dir_up,previous_5_up_rate,previous_10_up_rate,current_streak_length,breakout_up,breakout_down
Scaler hash: 4601e84a1282ef4c47244393a64ddd1c362ec7a18aac27db93d6e46de4f49458
TEST untouched at freeze time.
