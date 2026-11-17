# How Pitwall combines forecasts

Pitwall asks many forecast sources about the same place and shows one answer per 3-hour window, with how far the sources are apart. This page says exactly what is computed and why. The code is in `web/src/lib/stats.ts`, about 150 lines, with its tests in `tests/stats.test.ts`.

## The short version

For each 3-hour window:

1. Sources from the same forecasting centre are merged into one value (their median).
2. The **combined value** is the median of the centres.
3. The **80% range** is the 10th to 90th percentile of the centres, shown only with 3 centres or more.
4. **Rain** adds a count: "3 of 9 expect ≥ 0.5 mm".
5. **Wind direction** is a vote between 8 compass sectors: "7 of 9 agree: SW".

## 1. The same windows for everyone

Every source is cut into the same 3-hour UTC windows (00:00, 03:00 … 21:00). A window holds the temperature, wind speed and wind direction at its start, and the rain that falls during its 3 hours. A session is shown with the window it starts in: a race at 13:00 uses 12:00 to 15:00.

A value a source does not send stays missing. If a source only gives rain for 2 of a window's 3 hours, that window has no rain total from it: a partial sum would look like a real, too-low value. Further ahead, some sources switch from hourly to 3- or 6-hourly steps; those windows keep the temperature and wind but no rain.

Two sources need a conversion that is an assumption, not a measurement:

- **US National Weather Service** gives rain as totals over up to 6 hours. Pitwall shares each total evenly over its hours.
- **DMI** gives rain as a running total since the start of a model run. An hour's rain is the step to the next total; where the total drops, a new run starts and that hour is left missing.

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

**What it is not:** a probability for the weather. "80% range: 11 to 13 °C" does not mean the temperature will be between 11 and 13 with 80% chance. Forecasts can all agree and all be wrong, and because the centres are not fully independent the true uncertainty is usually somewhat wider than the range.

### Why not the 95% confidence interval of the earlier version

Pitwall 3.0.0-preview.0 showed mean ± t × s / √n, a Student's t interval. Two things were wrong with it here:

- **It answers a different question.** That interval is about where the true mean of a population lies, given a random sample from it. The models are not a random sample from a population of forecasts, and the question on a pit wall is "what will the weather do", not "what is the average model".
- **It misbehaves at both ends.** With 2 sources the t-value is 12.7, so 0.2 mm and 1.2 mm of rain gave "0 to 7 mm" and a band that filled the chart. With 20 sources it would shrink towards nothing (√n in the denominator) even when the models disagree by 5 °C, suggesting a certainty that is not there.

A percentile range does neither: it never extends beyond what some source actually forecasts, and it does not narrow just because more sources are added.

## 5. Rain: an amount and a count

Rain is rarely "about 1 mm"; it is "nothing" for some models and "a shower" for others. So next to the median amount Pitwall shows how many centres expect rain: **"3 of 9 expect ≥ 0.5 mm"**.

The threshold is **0.5 mm in the 3 hours**, about what it takes to wet a track. The earlier version counted from 0.1 mm and called the share a "chance of rain", so two sources saying 0.2 mm and 1.2 mm gave "Chance of rain 100%". Two things changed:

- Traces do not count. Models produce 0.1 or 0.2 mm under almost any grey sky.
- It is a count, not a percentage. "3 of 9" says what it is: how many forecasts expect rain. A percentage reads as a probability of rain, which this is not.

A centre whose sources give no rain value for a window is left out of the count instead of counting against rain.

## 6. Wind direction: a vote

Directions cannot be averaged like temperatures (350° and 10° would give 180°), and a "mean direction" hides a real disagreement between south-west and north-west. Each centre's direction falls in one of 8 sectors (N, NE … NW) and the most common one is shown with its count.

## Past weather

History and Track comparison show days from Open-Meteo's archive, which is reanalysis: a model's reconstruction on a grid of a few kilometres, not a gauge at the track. Local showers can be missed or smeared. A **rain day** is a day with at least 1 mm. Tracks are compared on the days they all have. When the archive cannot be reached, the pages fall back on the observations bundled with the app (29 October to 13 November 2026, built-in tracks only), where a day's rain is estimated from readings of the last hour's rain taken every 30 minutes.

## Limits worth knowing

- The values are for the start of a 3-hour window, not the exact session time.
- Sources reach different distances ahead (about 2.5 days for the high-resolution regional models, a week or more for the global ones), so late windows rest on fewer centres. The count is always shown.
- Mountain and coastal tracks are where models differ most from the track itself; every model describes a grid cell, not a corner.
