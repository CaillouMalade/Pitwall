# How Pitwall combines forecasts

Pitwall asks many forecast sources about the same place and shows one answer per hour, or per session, with how far the sources are apart. This page says exactly what is computed and why. The code is in `web/src/lib/stats.ts`, with its tests in `tests/stats.test.ts` and `tests/session.test.ts`.

## The short version

For each hour:

1. Sources from the same forecasting centre are merged into one value (their median).
2. The **combined value** is the median of the centres.
3. The **80% range** is the 10th to 90th percentile of the centres, shown only with 3 centres or more. On screen it is labelled "Range".
4. **Rain** adds a count: "3 of 9 expect rain", where rain is 0.2 mm or more in the hour.
5. **Wind direction** is a vote between 8 compass sectors: "7 of 9 agree: SW".

A **session** is combined the same way from each source's values over its hours, and gets a grade for how far the centres are apart.

## 1. The same hours for everyone

Every source is put on the same hourly steps. An hour holds the temperature, wind speed and wind direction at its start, and the rain that falls during it. Until 3.0.0-preview.1 the steps were 3 hours long; nearly every source gives hours for the first two to three days, so the app now shows them.

A value a source does not send stays missing, never 0. Further ahead, some sources switch from hourly to 3- or 6-hourly steps; there they still give temperature and wind at those hours, but no rain, and the hours in between come from the other sources only. The count of sources and centres is shown with every value.

Two sources need a conversion that is an assumption, not a measurement:

- **US National Weather Service** gives rain as totals over up to 6 hours. Pitwall shares each total evenly over its hours.
- **DMI** gives rain as a running total since the start of a model run. An hour's rain is the step to the next total; where the total drops, a new run starts and that hour is left missing.

Times are shown on the track's own clock. Each built-in circuit has its time zone; for a track you add it is looked up once from its coordinates, and until then its times are in UTC. A session at "14:00" is 14:00 at the track, also across a change of the clocks.

## 2. One vote per forecasting centre

More sources is not automatically more evidence. ECMWF's IFS and AIFS models start from the same analysis of the atmosphere. Outside the Nordic countries, MET Norway's forecast is built on ECMWF's. The DWD's MOSMIX is a statistical product of the DWD's own ICON model (and ECMWF's). If each of these counted separately, ECMWF's view would get three votes and the spread between "sources" would look smaller than the real disagreement between independent forecasts.

So each source belongs to the **centre** that runs it (`web/src/lib/sources.ts`), and a centre counts once. Inside a centre the value is the median of its sources (with two sources, their average); wind directions inside a centre are averaged as arrows, so 350° and 10° give 0°, not 180°.

| Centre            | Sources                                                     |
| ----------------- | ----------------------------------------------------------- |
| ECMWF             | ECMWF IFS, ECMWF AIFS, MET Norway (outside the Nordic area) |
| NOAA              | NOAA GFS, US National Weather Service                       |
| DWD               | DWD ICON, DWD MOSMIX                                        |
| MetCoOp           | SMHI, FMI Harmonie, MET Norway (inside the Nordic area)     |
| Météo-France      | Météo-France                                                |
| Met Office        | UK Met Office                                               |
| ECCC              | Canada GEM                                                  |
| JMA               | JMA                                                         |
| CMA               | CMA GRAPES                                                  |
| KNMI              | KNMI Harmonie                                               |
| DMI               | DMI Harmonie                                                |
| MeteoSwiss        | MeteoSwiss ICON                                             |
| ItaliaMeteo       | ItaliaMeteo ICON                                            |
| GeoSphere Austria | GeoSphere Austria                                           |

MetCoOp is the model Norway, Sweden and Finland run together. The "Nordic area" is a box (53°N to 73°N, 0° to 35°E) that roughly matches it. The Session dashboard lists every source next to its centre, so the grouping is visible.

This is a judgement, and it is not perfect. Centres still share things: every model starts from much the same observations, several regional models take their edges from ECMWF, and KNMI, DMI, MeteoSwiss and ItaliaMeteo run model code developed with others. Grouping by centre removes the obvious double counting, not all of it.

## 3. The combined value: a median

The combined value is the median of the centres, not the mean. One model that is far off (a thunderstorm placed on the track by one model only, a bad grid point in the mountains) drags a mean with it; the median stays with the bulk. With centres saying 7, 8, 8, 9 and 31 °C the mean is 12.6 and the median is 8.

The price is that the median ignores how far the outliers are. That is what the range is for.

## 4. The range: the middle 80% of the centres

The range runs from the 10th to the 90th percentile of the centres' values, with linear interpolation between neighbours (the usual definition, "type 7"). With 9 centres it leaves out about the lowest and the highest one.

It is shown only from **3 centres**. With 2 there is no "spread", only two numbers, so Pitwall shows both: "7.0 and 7.9 °C". With 1 it says "One source". With 3 or 4 centres the range is close to lowest-to-highest.

**What the range is:** how far today's independent forecasts are apart. Wide means they disagree and the answer is uncertain; narrow means they agree.

**What it is not:** a probability for the weather. "Range 11 to 13 °C" does not mean the temperature will be between 11 and 13 with 80% chance. Forecasts can all agree and all be wrong, and because the centres are not fully independent the true uncertainty is usually somewhat wider than the range.

### Why not the 95% confidence interval of the first version

Pitwall 3.0.0-preview.0 showed mean ± t × s / √n, a Student's t interval. Two things were wrong with it here:

- **It answers a different question.** That interval is about where the true mean of a population lies, given a random sample from it. The models are not a random sample from a population of forecasts, and the question on a pit wall is "what will the weather do", not "what is the average model".
- **It misbehaves at both ends.** With 2 sources the t-value is 12.7, so 0.2 mm and 1.2 mm of rain gave "0 to 7 mm" and a band that filled the chart. With 20 sources it would shrink towards nothing (√n in the denominator) even when the models disagree by 5 °C, suggesting a certainty that is not there.

A percentile range does neither: it never extends beyond what some source actually forecasts, and it does not narrow just because more sources are added.

## 5. Rain: an amount and a count

Rain is rarely "about 1 mm"; it is "nothing" for some models and "a shower" for others. So next to the median amount Pitwall shows how many centres expect rain: **"3 of 9 expect rain"**.

A centre expects rain in an hour from **0.2 mm**, about what it takes to wet a track. A trace of 0.1 mm, which models produce under almost any grey sky, does not count. (With 3-hour steps the threshold was 0.5 mm in the 3 hours, about the same rate.)

It is a count, not a percentage. "3 of 9" says what it is: how many forecasts expect rain. A percentage reads as a probability of rain, which this is not.

A centre whose sources give no rain value for an hour is left out of the count instead of counting against rain.

## 6. Wind direction: a vote

Directions cannot be averaged like temperatures (350° and 10° would give 180°), and a "mean direction" hides a real disagreement between south-west and north-west. Each centre's direction falls in one of 8 sectors (N, NE … NW) and the most common one is shown with its count.

## 7. A session as one answer

A session has a start and a length. Its values come from the full hours it touches: a race from 13:30 to 15:00 uses 13:00 and 14:00.

For each source, over those hours:

- **temperature and wind** are the mean;
- **wind direction** is the mean arrow;
- **rain** is the total. A source that misses the rain of one of the hours has no total: a partial sum would look like a real, too-dry value.

The sources are then merged by centre and combined exactly as an hour is. The rain count works on each centre's **wettest hour**: a centre expects rain in the session when one of its hours reaches 0.2 mm. A centre with 0.1 mm in each of three hours has a total of 0.3 mm but is not counted as expecting rain.

"Rain in the 3 hours before" is the same sum for the three hours before the start, as a hint at whether the track is still damp.

### How far apart: high, medium, low

Each session, and each of its values, gets a grade from how far the centres are apart. These are rules of thumb chosen for this app, not probabilities:

| Value       | Forecasts agree                                    | Some spread | Forecasts disagree      |
| ----------- | -------------------------------------------------- | ----------- | ----------------------- |
| Temperature | range ≤ 2 °C                                       | ≤ 4 °C      | wider                   |
| Wind        | range ≤ 2 m/s                                      | ≤ 4 m/s     | wider                   |
| Rain        | at most 15% of the centres are on the smaller side | at most 34% | closer to half and half |

The range is the 80% range, or with 2 centres the gap between them. With one centre there is no grade. The overall grade is the worst of the three. For rain, "9 of 9" and "0 of 9" both count as agreement: the grade is about whether the forecasts say the same thing, not about whether it rains.

## 8. The maps of a session

**The rain map** is one forecast, not the combination: Open-Meteo's "best match" mix of models, asked for rain in 15-minute steps at 49 points (7 by 7, 8 km apart) around the track, and drawn by blending between the points. Its colours are a rate in mm per hour. In central Europe and North America the 15-minute values come from high-resolution models; elsewhere Open-Meteo interpolates them from hourly values. The same request gives the 15-minute rain chart for the track itself. Because it is one forecast, it has no range, and it can differ from the combined answer above it.

**Radar** is a measurement of the last two hours, from RainViewer. It cannot show a session that has not started; the map opens on it when a session starts within two hours or is under way.

**The wind map** shows one wind for the whole circuit, because that is what a forecast has: model grid cells are 2 to 11 km wide, about the size of a circuit. The bold arrow is the mean arrow of the centres, each thin one a centre. Straights are stretches of 220 m or more where the outline turns less than 0.9° per 10 m. On each, the wind is split into the part along the straight (headwind or tailwind) and the part across it; the larger part names it. Buildings, grandstands and trees change the wind at car height and are not in any of this.

Circuit outlines come from OpenStreetMap. The start of the lap is placed on the pit straight, at the point nearest the middle of the pit lane; it is not the exact start line.

## Past weather

History and Track comparison show days and hours from Open-Meteo's archive, which is reanalysis: a model's reconstruction on a grid of a few kilometres, not a gauge at the track. Local showers can be missed or smeared. Days are the track's own calendar days. A **rain day** is a day with at least 1 mm.

- **These dates** looks at the weekend's three days in each of the 20 years before it. "Days with rain" is the share of those 60 days that were rain days; "Weekends with a rain day" is the share of the years with at least one. "Usual" is the median over the days, and "mostly" the middle 80%. Twenty years of three days is a small sample: it says what is normal, not what will happen.
- **Recent** and **Track comparison** show the last 14, 30 or 90 days. Tracks are compared on the days they all have, on one scale.
- **Pick dates** shows any range since 1940, by the hour up to 10 days and by the day beyond.

When the archive cannot be reached, Recent and Track comparison fall back on the observations bundled with the app (29 October to 13 November 2026, built-in tracks only), where a day's rain is estimated from readings of the last hour's rain taken every 30 minutes.

The CSV export has one row per track and hour, with the hour's start in UTC and in the track's time with its offset, in the units chosen in Settings. Empty cells are values the archive does not have.

## Limits worth knowing

- An hour's temperature and wind are the values at its start; a session's are the mean of its hours' starts.
- Sources reach different distances ahead (about 2.5 days for the high-resolution regional models, a week or more for the global ones), so late hours rest on fewer centres. The count is always shown.
- Mountain and coastal tracks are where models differ most from the track itself; every model describes a grid cell, not a corner.
