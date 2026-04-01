package com.sude.backend.controller;

public class ProfessorCreationResponse {
    private Long professorId;
    private String message;
    private boolean setupTokenGenerated;

    public ProfessorCreationResponse(Long professorId, String message, boolean setupTokenGenerated) {
        this.professorId = professorId;
        this.message = message;
        this.setupTokenGenerated = setupTokenGenerated;
    }

    // Getters
    public Long getProfessorId() {
        return professorId;
    }

    public String getMessage() {
        return message;
    }

    public boolean isSetupTokenGenerated() {
        return setupTokenGenerated;
    }
}