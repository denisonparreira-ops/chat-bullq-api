import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertSkillDto {
  @ApiProperty({ example: 'Liberação de acesso ao curso' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  description!: string;

  @ApiPropertyOptional({ example: 'pos-venda' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string;

  @ApiPropertyOptional({
    description:
      'Texto adicionado ao system prompt do agent quando essa skill estiver ativa. Use pra dar instruções específicas (ex: "se cliente passou e-mail e produto, tente liberar via unlockCourseAccess antes de transferir").',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  promptInstructions?: string;

  @ApiProperty({
    type: [String],
    description: 'Lista de toolIds que essa skill traz consigo.',
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(30)
  toolIds!: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Mensagem opcional descrevendo a mudança (vai pro changelog).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  changeNote?: string;
}
