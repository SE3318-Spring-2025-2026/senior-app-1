package com.sude.backend.controller;

import com.sude.backend.entity.Professor;
import com.sude.backend.service.ProfessorService;
import com.sude.backend.service.ProfessorSetupTokenService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private final ProfessorService professorService;
    private final ProfessorSetupTokenService professorSetupTokenService;

    public AdminController(ProfessorService professorService,
                           ProfessorSetupTokenService professorSetupTokenService) {
        this.professorService = professorService;
        this.professorSetupTokenService = professorSetupTokenService;
    }

    // Issue 6
    @PostMapping("/professors")
    public Professor createProfessor(@RequestBody Professor request) {
        return professorService.createProfessor(
                request.getEmail(),
                request.getFullName(),
                request.getDepartment()
        );
    }

    // Issue 7
    @PostMapping("/generate-setup-token/{professorId}")
    public String generateSetupToken(@PathVariable Long professorId) {
        return professorSetupTokenService.generateToken(professorId);
    }
}