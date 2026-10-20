package main

import "strings"

// Body fonts are local, allowlisted presets, never user-supplied CSS or file paths.
type BodyTypography struct {
	ChineseFont string `json:"chineseFont"`
	EnglishFont string `json:"englishFont"`
	FormulaSize string `json:"formulaSize"`
	LineSpacing string `json:"lineSpacing"`
}

func normaliseBodyTypography(input BodyTypography) BodyTypography {
	result := BodyTypography{ChineseFont: "follow", EnglishFont: "follow", FormulaSize: "standard", LineSpacing: "standard"}
	switch value := strings.ToLower(strings.TrimSpace(input.ChineseFont)); value {
	case "sans", "songti", "kaiti", "rounded", "mono":
		result.ChineseFont = value
	}
	switch value := strings.ToLower(strings.TrimSpace(input.EnglishFont)); value {
	case "arial", "georgia", "times", "verdana", "mono":
		result.EnglishFont = value
	}
	switch value := strings.ToLower(strings.TrimSpace(input.FormulaSize)); value {
	case "small", "large":
		result.FormulaSize = value
	}
	switch value := strings.ToLower(strings.TrimSpace(input.LineSpacing)); value {
	case "compact", "relaxed", "loose":
		result.LineSpacing = value
	}
	return result
}

func (a *App) SetBodyTypography(input BodyTypography) (BodyTypography, error) {
	settings := normaliseBodyTypography(input)
	_, err := a.updatePreferences(func(prefs *Preferences) {
		prefs.BodyTypography = settings
	})
	return settings, err
}
