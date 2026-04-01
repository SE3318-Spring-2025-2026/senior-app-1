package com.sude.backend.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
public class Professor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String email;
    private String fullName;
    private String department;

    private boolean setupRequired;
    private String setupToken;
    private LocalDateTime setupTokenExpires;

    // BOŞ CONSTRUCTOR (ŞART)
    public Professor() {}

    // GETTER - SETTER

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getFullName() {
        return fullName;
    }

    public void setFullName(String fullName) {
        this.fullName = fullName;
    }

    public String getDepartment() {
        return department;
    }

    public void setDepartment(String department) {
        this.department = department;
    }

    public boolean isSetupRequired() {
        return setupRequired;
    }

    public void setSetupRequired(boolean setupRequired) {
        this.setupRequired = setupRequired;
    }

    public String getSetupToken() {
        return setupToken;
    }

    public void setSetupToken(String setupToken) {
        this.setupToken = setupToken;
    }

    public LocalDateTime getSetupTokenExpires() {
        return setupTokenExpires;
    }

    public void setSetupTokenExpires(LocalDateTime setupTokenExpires) {
        this.setupTokenExpires = setupTokenExpires;
    }
}