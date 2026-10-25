export type SeasonalMoment = {
  end: string;
  id: string;
  name: string;
  play: string;
  sourceNote: string;
  start: string;
};

export function nextSeasonalMoments(
  moments: SeasonalMoment[],
  now = new Date(),
) {
  const nowTime = now.getTime();

  return moments
    .filter((moment) => new Date(`${moment.end}T23:59:59.999Z`).getTime() >= nowTime)
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime())
    .slice(0, 3);
}
