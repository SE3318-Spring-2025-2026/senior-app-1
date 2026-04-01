package com.sude.backend.controller;
import org.springframework.stereotype.Controller;
import com.sude.backend.entity.Professor;
import com.sude.backend.service.ProfessorService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminController {

    private final ProfessorService professorService;

    public AdminController(ProfessorService professorService) {
        this.professorService = professorService;
    }

    @PostMapping("/professors")
    public ProfessorCreationResponse createProfessor(@RequestBody Professor request) {
        Professor professor = professorService.createProfessor(
                request.getEmail(),
                request.getFullName(),
                request.getDepartment()
        );
        return new ProfessorCreationResponse(
                professor.getId(),
                "Professor account created. Setup token generated.",
                true
        );
    }
}