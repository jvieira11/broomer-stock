import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidCnpj, normalizeCnpj } from '../cnpj';

@ValidatorConstraint({ name: 'cnpj' })
class CnpjConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidCnpj(value);
  }
  defaultMessage() {
    return 'CNPJ inválido';
  }
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty({ message: 'Informe o nome da empresa' })
  @MaxLength(150)
  name?: string;

  // null ou vazio apaga o CNPJ.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? normalizeCnpj(value) || null
      : (value as null | undefined),
  )
  @ValidateIf((_dto, value) => value !== null)
  @Validate(CnpjConstraint)
  cnpj?: string | null;
}
