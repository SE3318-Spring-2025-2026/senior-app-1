const { DataTypes, Model } = require('sequelize');
const sequelize = require('../db');

class AdvisorRequest extends Model {}

AdvisorRequest.init(
  {
    id: {
      type: DataTypes.STRING, // Ana dal UUID (String) kullanıyor, sistemi bozmamak için bu kalmalı
      primaryKey: true,
    },
    groupId: {
      type: DataTypes.STRING, // Ana dal UUID (String) kullanıyor
      allowNull: false,
    },
    advisorId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    teamLeaderId: {
      type: DataTypes.INTEGER,
      allowNull: true, // Ana dalda null bırakılmasına izin verilmiş, esneklik için kalmalı
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'), // Senin eklediğin CANCELLED statüsü korundu
      allowNull: false,
      defaultValue: 'PENDING',
    },
    note: {
      type: DataTypes.TEXT, // Controller 'note' bekliyor ve TEXT uzun notlar için STRING'den daha güvenlidir
      allowNull: true,
    },
    decidedAt: {
      type: DataTypes.DATE, // Controller karar verildiğinde buraya tarih atıyor, zorunlu alan
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'AdvisorRequest',
    tableName: 'AdvisorRequests',
    timestamps: true,
  }
);

module.exports = AdvisorRequest;