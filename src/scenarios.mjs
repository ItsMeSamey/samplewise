export const scenarios = {
  water: {
    title: 'CreekWatch: a water-quality pilot', synthetic: true, budget: 720,
    strata: [
      { name: 'Urban tributaries', population: 420, sd: 18, cost: 4, min: 8, max: 100 },
      { name: 'Agricultural reaches', population: 310, sd: 30, cost: 7, min: 8, max: 80 },
      { name: 'Forest headwaters', population: 180, sd: 8, cost: 11, min: 5, max: 40 },
      { name: 'Estuary sites', population: 90, sd: 25, cost: 15, min: 5, max: 30 }
    ]
  },
  campus: {
    title: 'CampusPulse: a student travel survey', synthetic: true, budget: 500,
    strata: [
      { name: 'On-campus residents', population: 2800, sd: 12, cost: 2, min: 15, max: 100 },
      { name: 'Local commuters', population: 7200, sd: 24, cost: 3, min: 15, max: 130 },
      { name: 'Regional commuters', population: 1200, sd: 42, cost: 6, min: 10, max: 60 },
      { name: 'Online students', population: 1800, sd: 18, cost: 2, min: 10, max: 100 }
    ]
  },
  integer: {
    title: 'A small budget, a greedy trap', synthetic: true, budget: 21,
    strata: [
      { name: 'Accessible sites', population: 100, sd: 11, cost: 3, min: 1, max: 8 },
      { name: 'Remote sites', population: 100, sd: 14, cost: 5, min: 1, max: 8 }
    ]
  }
};
