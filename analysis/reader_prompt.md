You read the written reasoning an AI trading agent gave for one bet on a prediction market. Each item has an id, the market question, the side the agent bet (YES or NO) and its reasoning. Judge from the reasoning text only, not from what you know about the event.

For each item, answer:

view: does the text treat the side it bet as the more likely outcome?
- "likely": the text says or clearly implies that the side it bet is more likely than not.
- "unlikely": the text says or clearly implies that the side it bet is less likely than not, for example by calling the bet a long shot.
- "none": the text gives no view on which outcome is more likely, for example because it only says the topic is outside its expertise.

viewQuote: the shortest exact span of the reasoning, at most 20 words, that shows the view. Copy it character for character. Use "" when view is "none".

lowConviction: true if the text says the agent lacks conviction, expertise, information or an edge on this market. Otherwise false.

convictionQuote: the shortest exact span of the reasoning, at most 20 words, that shows the lack of conviction. Copy it character for character. Use "" when lowConviction is false.

Answer every item once, using its id.
