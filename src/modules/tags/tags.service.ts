import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { TagsRepository } from './tags.repository';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

const DEFAULT_TAG_COLOR = '#6B7280';

@Injectable()
export class TagsService {
  constructor(private readonly repository: TagsRepository) {}

  async create(orgId: string, dto: CreateTagDto) {
    const existing = await this.repository.findByOrg(orgId);
    const dup = existing.find((t) => t.name.toLowerCase() === dto.name.toLowerCase());
    if (dup) {
      throw new ConflictException('A tag with this name already exists');
    }
    return this.repository.create({
      name: dto.name,
      color: dto.color ?? DEFAULT_TAG_COLOR,
      organization: { connect: { id: orgId } },
    });
  }

  async findAll(orgId: string) {
    return this.repository.findByOrg(orgId);
  }

  async findOne(id: string, orgId: string) {
    const tag = await this.repository.findById(id);
    if (!tag || tag.organizationId !== orgId) {
      throw new NotFoundException('Tag not found');
    }
    return tag;
  }

  async update(id: string, orgId: string, dto: UpdateTagDto) {
    await this.findOne(id, orgId);
    if (dto.name !== undefined) {
      const all = await this.repository.findByOrg(orgId);
      const dup = all.find(
        (t) => t.id !== id && t.name.toLowerCase() === dto.name!.toLowerCase(),
      );
      if (dup) {
        throw new ConflictException('A tag with this name already exists');
      }
    }
    return this.repository.update(id, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.color !== undefined && { color: dto.color }),
    });
  }

  async remove(id: string, orgId: string) {
    await this.findOne(id, orgId);
    return this.repository.delete(id);
  }

  async addToConversation(convId: string, tagId: string, orgId: string) {
    await this.findOne(tagId, orgId);
    const conv = await this.repository.findConversationInOrg(convId, orgId);
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }
    try {
      return await this.repository.addTagToConversation(convId, tagId);
    } catch {
      throw new ConflictException('Tag already applied to this conversation');
    }
  }

  async removeFromConversation(convId: string, tagId: string, orgId: string) {
    await this.findOne(tagId, orgId);
    const conv = await this.repository.findConversationInOrg(convId, orgId);
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }
    try {
      return await this.repository.removeTagFromConversation(convId, tagId);
    } catch {
      throw new NotFoundException('Tag is not on this conversation');
    }
  }

  async addToContact(contactId: string, tagId: string, orgId: string) {
    await this.findOne(tagId, orgId);
    const contact = await this.repository.findContactInOrg(contactId, orgId);
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }
    try {
      return await this.repository.addTagToContact(contactId, tagId);
    } catch {
      throw new ConflictException('Tag already applied to this contact');
    }
  }

  async removeFromContact(contactId: string, tagId: string, orgId: string) {
    await this.findOne(tagId, orgId);
    const contact = await this.repository.findContactInOrg(contactId, orgId);
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }
    try {
      return await this.repository.removeTagFromContact(contactId, tagId);
    } catch {
      throw new NotFoundException('Tag is not on this contact');
    }
  }
}
