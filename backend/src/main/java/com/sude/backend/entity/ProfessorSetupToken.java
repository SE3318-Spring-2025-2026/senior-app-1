package com.sude.backend.entity; 

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
public class ProfessorSetupToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String token;

    private boolean used;

    private LocalDateTime createdAt;

    private LocalDateTime expiresAt;

    @ManyToOne
    @JoinColumn(name = "professor_id")
    private Professor professor;

    public ProfessorSetupToken() {}

    public ProfessorSetupToken(String token, Professor professor) {
        this.token = token;
        this.professor = professor;
        this.used = false;
        this.createdAt = LocalDateTime.now();
        this.expiresAt = LocalDateTime.now().plusDays(1);
    }

    // getters & setters (IDE generate et 🔥)
}