package com.sude.backend.dto;

public class ProfessorSetupRequest {

    private String token;
    private String password;

    public ProfessorSetupRequest() {
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }
}