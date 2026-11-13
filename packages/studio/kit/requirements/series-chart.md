# kit.series-chart

- Status: active
- Since: 0.1.0
- Source: HAL-8422, HAL-8442; board decision of 13 Nov (HAL-8416)

The kit's `SeriesChart` shall draw up to four series as lines over the same x positions, on a card, in the series colours in order: blue, rose, teal, periwinkle (`series-1` to `series-4`). It shall write each series' name at the end of its line in that line's colour, not in a legend, and shall nudge names apart that would touch. When given more than four series, it shall keep the three with the largest last value and sum the rest, position by position, into a line named "Other" in the slate `series-other`. It shall name the chart by its title and give screen readers every series' values as text.

## Examples

- Given four series, when it renders, then the lines use `series-1` to `series-4` in order and each name sits at its line's end.
- Given two series that end at the same value, when it renders, then their names are at least 14 units apart.
- Given six series, when it renders, then three keep their lines and the other three are one "Other" line with their sums.
- Given a title "Spend by agent", when it renders, then the chart is named "Spend by agent" and its text alternative lists every series.
